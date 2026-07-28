// deploy.mjs — publish dist/ to the gh-pages branch via a temporary git worktree.
// Zero dependencies: uses only built-in Node.js modules and git/pnpm on PATH.
//
//   node scripts/deploy.mjs [--dry-run] [--allow-dirty]
//
// Contract:
//   1. Refuses to run on a dirty working tree unless --allow-dirty is passed.
//      (Dirty files are listed; a clean commit is a prerequisite so the
//      deploy sha is meaningful.)
//   2. Records the current HEAD sha and branch for the commit message.
//   3. Runs `pnpm run build` (astro build); aborts on non-zero exit.
//   4. Runs the same two dist gates as .github/workflows/deploy.yml, in order:
//        node scripts/check-links.mjs dist
//        node scripts/check-asset-sizes.mjs dist
//   5. Asserts dist/CNAME exists and contains "ilies-bel.dev".
//      Publishing without CNAME drops the custom domain on GitHub Pages — hard abort.
//   6. Asserts dist/index.html exists and is non-empty.
//   7. --dry-run: executes all of the above (build + gates + assertions), then
//      prints what WOULD be pushed (target branch, commit message, file count,
//      total byte size of dist/) and exits 0. No network access, no git mutations.
//   8. Publishes dist/ to origin/gh-pages via a temp git worktree in os.tmpdir();
//      the main checkout is never mutated. The worktree is cleaned up in a finally
//      block even on failure. Writes .nojekyll so GitHub Pages does not run Jekyll
//      over _astro/ assets (without it, any path starting with _ is stripped).
//      Creates gh-pages as an orphan branch on first run if it does not exist
//      locally or on origin.
//   9. Prints the live URL (https://ilies-bel.dev) on success.
//
// dist/ is gitignored in the main checkout — that is expected. The gh-pages worktree
// is a separate branch where the built output IS the tracked content.

import {
  existsSync, readFileSync, readdirSync, statSync,
  mkdirSync, copyFileSync, writeFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LIVE_URL = 'https://ilies-bel.dev';
const CNAME_VALUE = 'ilies-bel.dev';
const GH_PAGES_BRANCH = 'gh-pages';

const cliArgs = process.argv.slice(2);
const DRY_RUN = cliArgs.includes('--dry-run');
const ALLOW_DIRTY = cliArgs.includes('--allow-dirty');

// Project root is the parent of scripts/.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(ROOT, 'dist');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command with inherited stdio. Throws on non-zero exit. */
function run(cmd, cwd = ROOT) {
  const [bin, ...rest] = cmd;
  const r = spawnSync(bin, rest, { cwd, stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`Command failed (exit ${r.status}): ${cmd.join(' ')}`);
  }
}

/** Run a command capturing stdout. Throws on non-zero exit. Returns stdout string. */
function capture(cmd, cwd = ROOT) {
  const [bin, ...rest] = cmd;
  const r = spawnSync(bin, rest, { cwd, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`Command failed (exit ${r.status}): ${cmd.join(' ')}\n${r.stderr ?? ''}`);
  }
  return r.stdout ?? '';
}

/** Recursively walk a directory; returns absolute file paths. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Recursively copy src directory into dst, creating subdirectories as needed. */
function copyDir(src, dst) {
  for (const name of readdirSync(src)) {
    const srcPath = join(src, name);
    const dstPath = join(dst, name);
    if (statSync(srcPath).isDirectory()) {
      mkdirSync(dstPath, { recursive: true });
      copyDir(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1: dirty-tree check
// ---------------------------------------------------------------------------
const porcelain = capture(['git', 'status', '--porcelain']).trim();
if (porcelain && !ALLOW_DIRTY) {
  console.error('deploy: working tree is dirty. Commit or stash your changes first.');
  console.error('  Pass --allow-dirty to deploy anyway.\n');
  console.error('Dirty files:');
  for (const line of porcelain.split('\n')) console.error(' ', line);
  process.exit(1);
}
if (porcelain && ALLOW_DIRTY) {
  console.warn('deploy: --allow-dirty set; proceeding with a dirty working tree.');
}

// ---------------------------------------------------------------------------
// Step 2: record HEAD sha and branch
// ---------------------------------------------------------------------------
const headSha = capture(['git', 'rev-parse', '--short', 'HEAD']).trim();
let headBranch;
try {
  headBranch = capture(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).trim();
} catch {
  headBranch = 'unknown';
}
const commitMessage = `deploy: ${headSha} from ${headBranch}`;

console.log(`\ndeploy: HEAD ${headSha} on ${headBranch}`);
console.log(`deploy: commit message will be: "${commitMessage}"\n`);

// ---------------------------------------------------------------------------
// Step 3: build
// ---------------------------------------------------------------------------
console.log('deploy: running pnpm run build…');
run(['pnpm', 'run', 'build']);

// ---------------------------------------------------------------------------
// Step 4: dist gates (same order as .github/workflows/deploy.yml)
// ---------------------------------------------------------------------------
console.log('\ndeploy: running dist gates…');
run(['node', 'scripts/check-links.mjs', 'dist']);
run(['node', 'scripts/check-asset-sizes.mjs', 'dist']);

// ---------------------------------------------------------------------------
// Step 5: assert dist/CNAME exists and contains the custom domain
// ---------------------------------------------------------------------------
const cnamePath = join(distDir, 'CNAME');
if (!existsSync(cnamePath)) {
  console.error('deploy: dist/CNAME is missing — publishing would drop the custom domain binding.');
  console.error(`  Ensure public/CNAME contains "${CNAME_VALUE}" so astro build copies it to dist/.`);
  process.exit(1);
}
const cnameContent = readFileSync(cnamePath, 'utf8').trim();
if (!cnameContent.includes(CNAME_VALUE)) {
  console.error(`deploy: dist/CNAME does not contain "${CNAME_VALUE}" (found: "${cnameContent}").`);
  process.exit(1);
}
console.log(`deploy: dist/CNAME ✓ (${cnameContent})`);

// ---------------------------------------------------------------------------
// Step 6: assert dist/index.html exists and is non-empty
// ---------------------------------------------------------------------------
const indexPath = join(distDir, 'index.html');
if (!existsSync(indexPath)) {
  console.error('deploy: dist/index.html is missing — build did not produce a root page.');
  process.exit(1);
}
if (statSync(indexPath).size === 0) {
  console.error('deploy: dist/index.html is empty.');
  process.exit(1);
}
console.log('deploy: dist/index.html ✓');

// ---------------------------------------------------------------------------
// Step 7: --dry-run summary then exit
// ---------------------------------------------------------------------------
if (DRY_RUN) {
  const allFiles = walk(distDir);
  const totalBytes = allFiles.reduce((sum, f) => sum + statSync(f).size, 0);
  const totalKB = (totalBytes / 1024).toFixed(1);

  console.log('\n── dry-run summary ──────────────────────────────────────────────');
  console.log(`  target branch : origin/${GH_PAGES_BRANCH}`);
  console.log(`  commit message: ${commitMessage}`);
  console.log(`  files in dist : ${allFiles.length}`);
  console.log(`  dist size     : ${totalKB} KB`);
  console.log('──────────────────────────────────────────────────────────────────');
  console.log('deploy: --dry-run complete. Nothing was pushed.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Step 8: publish dist/ to gh-pages via a temp git worktree
// ---------------------------------------------------------------------------
const worktreePath = join(tmpdir(), `gh-pages-deploy-${Date.now()}`);

try {
  // Ensure the gh-pages branch exists locally before we add a worktree for it.
  const localExists =
    spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${GH_PAGES_BRANCH}`], {
      cwd: ROOT,
    }).status === 0;

  if (!localExists) {
    const remoteLs = capture(['git', 'ls-remote', '--heads', 'origin', GH_PAGES_BRANCH]).trim();
    if (remoteLs) {
      // Branch exists on origin but not locally — fetch it.
      console.log(`deploy: fetching ${GH_PAGES_BRANCH} from origin…`);
      run(['git', 'fetch', 'origin', `${GH_PAGES_BRANCH}:${GH_PAGES_BRANCH}`]);
    } else {
      // First-time: create an orphan branch via git plumbing so we don't touch
      // the main checkout. We write an empty tree object, commit it, and point
      // a new local branch at that commit.
      console.log(`deploy: ${GH_PAGES_BRANCH} not found anywhere; creating orphan branch…`);
      const emptyTreeResult = spawnSync(
        'git', ['hash-object', '-w', '-t', 'tree', '--stdin'],
        { cwd: ROOT, input: '', encoding: 'utf8' },
      );
      if (emptyTreeResult.error || emptyTreeResult.status !== 0) {
        throw new Error('Failed to create empty tree object for orphan branch');
      }
      const emptyTreeSha = emptyTreeResult.stdout.trim();
      const orphanCommit = capture([
        'git', 'commit-tree', emptyTreeSha, '-m', `init: ${GH_PAGES_BRANCH} orphan`,
      ]).trim();
      run(['git', 'branch', GH_PAGES_BRANCH, orphanCommit]);
    }
  }

  // Add worktree in a temp directory.
  console.log(`deploy: creating worktree at ${worktreePath}…`);
  run(['git', 'worktree', 'add', worktreePath, GH_PAGES_BRANCH]);

  // Delete all tracked files so removed pages actually disappear from the branch.
  // On a fresh orphan branch git rm exits 128 ("pathspec '.' did not match any files"),
  // not 1, so we check first rather than guessing at exit codes.
  const tracked = capture(['git', 'ls-files'], worktreePath).trim();
  if (tracked) {
    console.log('deploy: clearing existing tracked files…');
    run(['git', 'rm', '-rf', '.'], worktreePath);   // real failures still throw
  } else {
    console.log('deploy: branch has no tracked files yet; nothing to clear.');
  }

  // Copy the built site into the worktree.
  console.log('deploy: copying dist/ into worktree…');
  copyDir(distDir, worktreePath);

  // Write .nojekyll so GitHub Pages does not run Jekyll and strip _astro/ paths.
  writeFileSync(join(worktreePath, '.nojekyll'), '');

  // Stage everything, commit, and push.
  run(['git', 'add', '-A'], worktreePath);
  run(['git', 'commit', '--allow-empty', '-m', commitMessage], worktreePath);

  console.log(`deploy: pushing to origin/${GH_PAGES_BRANCH}…`);
  run(['git', 'push', 'origin', GH_PAGES_BRANCH], worktreePath);

  console.log(`\ndeploy: ✓ published to ${GH_PAGES_BRANCH}`);
  console.log(`        live at ${LIVE_URL}`);
} finally {
  // Clean up the worktree even if something above threw.
  console.log('deploy: cleaning up worktree…');
  // git worktree remove deregisters the worktree from .git/worktrees/ and deletes
  // the directory. If the worktree was never added (error in add step), the command
  // will fail — the rmSync fallback handles the directory either way.
  spawnSync('git', ['worktree', 'remove', '--force', worktreePath], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (existsSync(worktreePath)) {
    rmSync(worktreePath, { recursive: true, force: true });
  }
}
