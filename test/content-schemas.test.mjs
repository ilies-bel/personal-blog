// Content-collection schema policy, pinned — the EVIDENCE CONTRACT (P6).
//
// Like gl-governor.test.mjs this imports the REAL module: contentSchemas.ts is
// pure erasable TypeScript (astro/zod only, no `astro:content` virtual module),
// so node's type-stripping import exercises the exact schemas the build runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { projectSchema as projects, graveyardSchema as graveyard } from '../src/lib/contentSchemas.ts';

// A minimal valid shipped project; tests override the fields under scrutiny.
const baseProject = {
  title: 'Fixture',
  status: 'shipped',
  role: 'Solo',
  stack: ['ts'],
  summary: 'A fixture.',
  statusLabel: 'Open source · shipped',
  limitations: ['does one thing only'],
};

test('an unevidenced claim with draftEvidence:false FAILS the parse, naming the claim', () => {
  const result = projects.safeParse({
    ...baseProject,
    claims: [{ statement: 'it has genuine adoption', evidence: { type: 'none' } }],
    draftEvidence: false,
  });
  assert.equal(result.success, false, 'must not parse');
  const messages = result.error.issues.map((i) => i.message).join('\n');
  assert.match(messages, /it has genuine adoption/, 'the error names the offending claim');
  assert.match(messages, /draftEvidence/, 'the error points at the escape hatch');
});

test('the same claim passes while the debt is flagged (draftEvidence:true)', () => {
  const result = projects.safeParse({
    ...baseProject,
    claims: [{ statement: 'it has genuine adoption', evidence: { type: 'none' } }],
    draftEvidence: true,
  });
  assert.equal(result.success, true, result.success ? '' : JSON.stringify(result.error.issues));
});

test('a claim with real evidence needs no draft flag', () => {
  const result = projects.safeParse({
    ...baseProject,
    claims: [
      {
        statement: '1.2k npm downloads/month',
        evidence: { type: 'metric', source: 'npm', url: 'https://npmjs.com/x', date: '2026-07' },
      },
    ],
  });
  assert.equal(result.success, true);
});

test('a SHIPPED project must list at least one limitation', () => {
  const result = projects.safeParse({ ...baseProject, limitations: [] });
  assert.equal(result.success, false);
  assert.match(result.error.issues.map((i) => i.message).join('\n'), /limitation/i);
});

test('a PRIVATE project may omit limitations… but not claims-without-evidence', () => {
  const ok = projects.safeParse({
    ...baseProject,
    status: 'private',
    statusLabel: 'Private · in use',
    limitations: [],
  });
  assert.equal(ok.success, true, 'private without limitations parses');

  const bad = projects.safeParse({
    ...baseProject,
    status: 'private',
    statusLabel: 'Private · in use',
    limitations: [],
    claims: [{ statement: 'in production use', evidence: { type: 'none' } }],
    draftEvidence: false,
  });
  assert.equal(bad.success, false, 'the evidence gate applies to every status');
});

test('claim evidence.type is a closed enum', () => {
  const result = projects.safeParse({
    ...baseProject,
    claims: [{ statement: 'x', evidence: { type: 'vibes' } }],
  });
  assert.equal(result.success, false);
});

test('media image must be a bare asset filename — a path cannot sneak past the P5 gate', () => {
  const withPath = projects.safeParse({
    ...baseProject,
    media: {
      kind: 'image',
      image: '../../assets/projects/fleet.png', // path form = the image() route we rejected
      alt: 'alt',
      caption: 'cap',
    },
  });
  assert.equal(withPath.success, false, 'relative paths are rejected');

  const withFilename = projects.safeParse({
    ...baseProject,
    media: { kind: 'image', image: 'fleet.png', alt: 'alt', caption: 'cap' },
  });
  assert.equal(withFilename.success, true, 'bare filenames parse');

  const diagram = projects.safeParse({
    ...baseProject,
    media: { kind: 'diagram', diagram: 'mars-topology', caption: 'cap' },
  });
  assert.equal(diagram.success, true, 'named diagrams parse');

  const unknownDiagram = projects.safeParse({
    ...baseProject,
    media: { kind: 'diagram', diagram: 'not-a-diagram', caption: 'cap' },
  });
  assert.equal(unknownDiagram.success, false, 'diagram names are a closed enum');
});

test('graveyard specimen: full record parses; lesson/cause/interred are required', () => {
  const full = graveyard.safeParse({
    name: 'DeadThing',
    link: { href: 'https://example.com/', label: 'example.com' },
    image: { src: "x.png", alt: "alt", caption: "cap" },
    interred: '2024',
    cause: 'No market',
    lesson: 'validate first',
  });
  assert.equal(full.success, true);

  const missing = graveyard.safeParse({
    name: 'DeadThing',
    link: { href: 'https://example.com/', label: 'example.com' },
    image: { src: "x.png", alt: "alt", caption: "cap" },
    interred: '2024',
    cause: 'No market',
    // lesson omitted — a specimen without its lesson is just a corpse.
  });
  assert.equal(missing.success, false);
});
