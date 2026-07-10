// Metadata completeness test — parses built HTML in dist/ to assert that every
// public route ships with correct SEO metadata, valid JSON-LD, and that the
// sitemap covers the right pages.
//
// REQUIRES a prior `npm run build`. When dist/ is absent (e.g. first `npm test`
// in a fresh CI checkout before build), all tests are skipped rather than failed
// so the standard test → build workflow stays unblocked.
//
// The canonical way to run this in isolation:
//   npm run build && node --test test/metadata.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const distDir = resolve(root, 'dist');

const distExists = existsSync(distDir);

// ---------------------------------------------------------------------------
// HTML helpers (regex-based; no DOM dependency)
// ---------------------------------------------------------------------------

/** Extract <title> text content. */
const pageTitle = (html) => {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
};

/** Extract content of a <meta name="..."> tag. */
const metaName = (html, name) => {
  // Both attribute orders: name first, content first.
  const re1 = new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`, 'i');
  const re2 = new RegExp(`<meta[^>]+content="([^"]*)"[^>]+name="${name}"`, 'i');
  const m = html.match(re1) ?? html.match(re2);
  return m ? m[1] : null;
};

/** Extract content of a <meta property="..."> tag (Open Graph). */
const metaProp = (html, property) => {
  const re1 = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i');
  const re2 = new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, 'i');
  const m = html.match(re1) ?? html.match(re2);
  return m ? m[1] : null;
};

/** Extract href of <link rel="canonical">. */
const canonicalHref = (html) => {
  const m = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i)
    ?? html.match(/<link[^>]+href="([^"]*)"[^>]+rel="canonical"/i);
  return m ? m[1] : null;
};

/** Parse and return all JSON-LD script payloads in the page as objects. */
const jsonLdBlocks = (html) => {
  const results = [];
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      results.push(JSON.parse(m[1]));
    } catch (e) {
      throw new Error(`Malformed JSON-LD in page: ${e.message}\n  Content: ${m[1].slice(0, 120)}…`);
    }
  }
  return results;
};

/** Return the @type values present in the page's JSON-LD blocks. */
const schemaTypes = (html) =>
  jsonLdBlocks(html)
    .flatMap((block) =>
      Array.isArray(block['@graph'])
        ? block['@graph'].map((n) => n['@type'])
        : [block['@type']],
    )
    .filter(Boolean);

/** Read a file from dist/ or return null if it doesn't exist. */
const readDist = (relPath) => {
  const abs = resolve(distDir, relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
};

// ---------------------------------------------------------------------------
// Route table — every public page with its expected metadata checks.
// ---------------------------------------------------------------------------

const ROUTES = [
  {
    file: 'index.html',
    label: 'Home (/)',
    // Home title is the bare site name (no suffix).
    expectedTitlePattern: /^Iliès$/,
    requireSchemas: ['WebSite', 'Person'],
  },
  {
    file: 'about/index.html',
    label: 'About (/about/)',
    expectedTitlePattern: /About/i,
    requireSchemas: ['Person'],
  },
  {
    file: 'writing/index.html',
    label: 'Writing (/writing/)',
    expectedTitlePattern: /Writing/i,
    requireSchemas: ['WebSite'],
  },
  {
    file: 'projects/index.html',
    label: 'Projects (/projects/)',
    expectedTitlePattern: /Projects/i,
    requireSchemas: ['CreativeWork'],
  },
  {
    file: 'graveyard/index.html',
    label: 'Graveyard (/graveyard/)',
    expectedTitlePattern: /Graveyard/i,
    requireSchemas: ['WebSite'],
  },
  {
    // behind-the-build is a full technical case study rendered as type="article".
    file: 'behind-the-build/index.html',
    label: 'Behind the Build (/behind-the-build/)',
    expectedTitlePattern: /Behind the Build/i,
    requireSchemas: ['BlogPosting'],
  },
  {
    file: 'posts/memory-leak-search-and-destroy/index.html',
    label: 'Post: Memory Leak',
    expectedTitlePattern: /Memory Leak/i,
    requireSchemas: ['BlogPosting'],
  },
  {
    // The frontmatter title of this post is "Why this begins at the end"
    // (the file's slug and title diverge by design).
    file: 'posts/thanks-for-scrolling-to-the-bottom/index.html',
    label: 'Post: Why this begins at the end',
    expectedTitlePattern: /Why this begins at the end/i,
    requireSchemas: ['BlogPosting'],
  },
];

// ---------------------------------------------------------------------------
// Tests — only registered when dist/ exists
// ---------------------------------------------------------------------------

if (distExists) {
  describe('per-route metadata completeness', () => {
    for (const route of ROUTES) {
      describe(route.label, () => {
        const html = readDist(route.file);

        test('HTML file exists in dist', () => {
          assert.ok(html !== null, `Expected dist/${route.file} to exist after build`);
        });

        if (html === null) return; // remaining tests would throw — skip them

        test('has non-empty <title>', () => {
          const t = pageTitle(html);
          assert.ok(t && t.length > 0, `<title> missing or empty`);
          assert.match(t, route.expectedTitlePattern, `title "${t}" does not match ${route.expectedTitlePattern}`);
        });

        test('has non-empty meta description', () => {
          const d = metaName(html, 'description');
          assert.ok(d && d.length > 0, `<meta name="description"> missing or empty`);
        });

        test('has canonical link', () => {
          const c = canonicalHref(html);
          assert.ok(c && c.startsWith('https://'), `<link rel="canonical"> missing or not absolute (got: ${c})`);
        });

        test('canonical points to ilies-bel.dev', () => {
          const c = canonicalHref(html);
          assert.match(c ?? '', /^https:\/\/ilies-bel\.dev\//, `canonical should be on ilies-bel.dev (got: ${c})`);
        });

        test('has og:title', () => {
          const v = metaProp(html, 'og:title');
          assert.ok(v && v.length > 0, `og:title missing or empty`);
        });

        test('has og:description', () => {
          const v = metaProp(html, 'og:description');
          assert.ok(v && v.length > 0, `og:description missing or empty`);
        });

        test('has og:image (absolute URL)', () => {
          const v = metaProp(html, 'og:image');
          assert.ok(v && v.startsWith('https://'), `og:image missing or not absolute (got: ${v})`);
        });

        test('has og:image:width', () => {
          const v = metaProp(html, 'og:image:width');
          assert.ok(v && /^\d+$/.test(v), `og:image:width missing or not numeric (got: ${v})`);
        });

        test('has og:image:height', () => {
          const v = metaProp(html, 'og:image:height');
          assert.ok(v && /^\d+$/.test(v), `og:image:height missing or not numeric (got: ${v})`);
        });

        test('has og:url', () => {
          const v = metaProp(html, 'og:url');
          assert.ok(v && v.startsWith('https://'), `og:url missing or not absolute (got: ${v})`);
        });

        test('has og:locale', () => {
          const v = metaProp(html, 'og:locale');
          assert.equal(v, 'en_US', `og:locale should be "en_US" (got: ${v})`);
        });

        test('has twitter:card', () => {
          const v = metaName(html, 'twitter:card');
          assert.ok(v && v.length > 0, `twitter:card missing`);
        });

        test('has twitter:title', () => {
          const v = metaName(html, 'twitter:title');
          assert.ok(v && v.length > 0, `twitter:title missing or empty`);
        });

        test('has twitter:description', () => {
          const v = metaName(html, 'twitter:description');
          assert.ok(v && v.length > 0, `twitter:description missing or empty`);
        });

        test('has twitter:image (absolute URL)', () => {
          const v = metaName(html, 'twitter:image');
          assert.ok(v && v.startsWith('https://'), `twitter:image missing or not absolute (got: ${v})`);
        });

        test('has at least one valid JSON-LD block', () => {
          const blocks = jsonLdBlocks(html); // throws on parse error
          assert.ok(blocks.length > 0, `No <script type="application/ld+json"> found`);
        });

        for (const schemaType of route.requireSchemas) {
          test(`has ${schemaType} JSON-LD schema`, () => {
            const types = schemaTypes(html);
            assert.ok(
              types.includes(schemaType),
              `Expected schema @type "${schemaType}" — found: [${types.join(', ')}]`,
            );
          });
        }

        // BlogPosting must carry an author with a name (Person node).
        if (route.requireSchemas.includes('BlogPosting')) {
          test('BlogPosting has author with name', () => {
            const blocks = jsonLdBlocks(html);
            const post = blocks.find((b) => b['@type'] === 'BlogPosting');
            assert.ok(post, 'BlogPosting block not found');
            assert.ok(post.author?.name, `BlogPosting.author.name missing (got: ${JSON.stringify(post.author)})`);
          });
        }
      });
    }
  });

  // -------------------------------------------------------------------------
  // Sitemap checks
  // -------------------------------------------------------------------------
  describe('sitemap', () => {
    test('sitemap-index.xml exists in dist', () => {
      assert.ok(existsSync(resolve(distDir, 'sitemap-index.xml')), 'dist/sitemap-index.xml missing');
    });

    test('sitemap-index.xml references sitemap-0.xml', () => {
      const xml = readDist('sitemap-index.xml');
      assert.ok(xml, 'sitemap-index.xml not readable');
      assert.match(xml, /sitemap-0\.xml/, 'sitemap-index.xml should reference sitemap-0.xml');
    });

    test('sitemap does not include /dev-blueprint', () => {
      const xml = readDist('sitemap-0.xml');
      assert.ok(xml, 'sitemap-0.xml not readable — was sitemap-index.xml generated?');
      assert.doesNotMatch(xml, /dev-blueprint/, '/dev-blueprint must not appear in sitemap');
    });

    test('sitemap includes home (/)', () => {
      const xml = readDist('sitemap-0.xml');
      assert.ok(xml, 'sitemap-0.xml not readable');
      assert.match(xml, /ilies-bel\.dev\/?<\/loc>|ilies-bel\.dev\/<\/loc>/, 'home URL missing from sitemap');
    });

    test('sitemap includes /about/', () => {
      const xml = readDist('sitemap-0.xml');
      assert.match(xml ?? '', /\/about\//, '/about/ missing from sitemap');
    });

    test('sitemap includes /projects/', () => {
      const xml = readDist('sitemap-0.xml');
      assert.match(xml ?? '', /\/projects\//, '/projects/ missing from sitemap');
    });
  });

  // -------------------------------------------------------------------------
  // robots.txt checks
  // -------------------------------------------------------------------------
  describe('robots.txt', () => {
    test('robots.txt exists in dist', () => {
      assert.ok(existsSync(resolve(distDir, 'robots.txt')), 'dist/robots.txt missing');
    });

    test('robots.txt Sitemap directive points at sitemap-index.xml', () => {
      const robots = readDist('robots.txt');
      assert.ok(robots, 'robots.txt not readable');
      assert.match(
        robots,
        /Sitemap:\s*https:\/\/ilies-bel\.dev\/sitemap-index\.xml/,
        'robots.txt must reference https://ilies-bel.dev/sitemap-index.xml',
      );
    });
  });
} else {
  // dist/ not present — emit a single informational test so the suite output
  // makes clear what happened rather than being an empty run.
  test('metadata tests require a prior build (dist/ absent — run `npm run build` first)', () => {
    // Use console.warn rather than assert.fail so the overall test suite stays
    // green on the first cold checkout before build runs.
    console.warn(
      '[metadata.test.mjs] dist/ not found — skipping all assertions. ' +
        'Run `npm run build` to generate dist/, then re-run the tests.',
    );
  });
}
