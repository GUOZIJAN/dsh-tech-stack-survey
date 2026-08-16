// Anti-drift test: the four install-mode twins are GENERATED from the shared
// single sources of truth (shared/survey-core.js, shared/client-core.js) by
// scripts/build.mjs. This test regenerates them in memory and fails whenever a
// committed twin has been hand-edited out of sync — the regression guard for
// the dynamic/static dual-maintenance drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate } from '../scripts/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Normalize line endings so a CRLF checkout never produces a false drift. */
const norm = (text) => String(text).replace(/\r\n/g, '\n');
const read = (rel) => norm(readFileSync(join(root, rel), 'utf8'));

test('generated twins match the shared single sources of truth (no drift)', () => {
  const gen = generate();
  const targets = [
    ['host.js', gen.host, 'dynamic Host body'],
    ['client.js', gen.client, 'dynamic Client body'],
    ['lib/index.js', gen.libIndex, 'static Host package'],
    ['lib/client.js', gen.libClient, 'static Client bundle'],
  ];
  for (const [rel, wanted, label] of targets) {
    assert.equal(
      read(rel),
      norm(wanted),
      `${label} (${rel}) drifted from shared/* — run \`npm run build\` instead of hand-editing generated files`,
    );
  }
});
