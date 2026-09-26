// SPDX-License-Identifier: MIT OR Apache-2.0

// The documented size claims, checked against the real measurement.
//
// `npm run size` measures what a consumer ships; this script runs it and holds two things to it:
//
//   1. every measurement still matches the value declared in `scripts/expected-counts.mjs`, and
//   2. every document that states a measured size quotes exactly those declared values.
//
// Before this, four documents restated the sizes as prose and drifted three different ways — README,
// STATUS and docs/verification.md agreed with a state that no longer existed, and docs/performance.md
// still carried the pre-@size-limit/esbuild numbers while claiming `npm run size` produced them. A
// number nobody re-derives is a number that will be wrong. The tolerance below is wide enough that a
// minifier bump does not trip it, and far too narrow to pass a real drift.
//
// The published, unminified artifacts are a different measurement with a different tripwire — see
// `verify.mjs`; this script only knows about consumer cost.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPECTED_COUNTS, EXPECTED_SIZES, formatSize } from './expected-counts.mjs';

const TOLERANCE = 0.01; // 1% of the declared size — a real drift, not a byte of minifier noise
const root = new URL('..', import.meta.url).pathname;

// Which document states which measured size. A size stated anywhere else is not gated, so it does not
// get stated elsewhere: README points at the table instead of repeating it.
const DOC_QUOTES = {
  'docs/verification.md': ['esmFull', 'esmButton', 'cjsFull', 'stylesheet'],
  'STATUS.md': ['esmFull', 'esmButton', 'stylesheet']
};

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// Read the measurement; do not trust a cached one. size-limit exits non-zero when a budget fails but
// still prints the figures, so a budget breach is reported per-entry below rather than as a crash.
let measured;
try {
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'size-limit.cmd' : 'size-limit');
  const stdout = execFileSync(bin, ['--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  measured = JSON.parse(stdout);
} catch (error) {
  const partial = error.stdout;
  try {
    measured = JSON.parse(partial);
  } catch {
    console.error('size claims: could not measure — is the build present? (npm run build)');
    console.error(String(partial || error.message).slice(0, 600));
    process.exit(1);
  }
}

const byName = new Map(measured.map((entry) => [entry.name, entry]));
const entries = Object.entries(EXPECTED_SIZES);

check(
  `all ${entries.length} sized artifacts were measured`,
  entries.every(([, claim]) => byName.has(claim.entry)),
  `${byName.size} of ${entries.length} entries reported`
);

for (const [key, claim] of entries) {
  const found = byName.get(claim.entry);
  if (!found) {
    check(`${key}: matches its declared size`, false, `no size-limit entry "${claim.entry}"`);
    check(`${key}: under its ${formatSize(claim.budget)} budget`, false, 'not measured');
    continue;
  }
  const drift = Math.abs(found.size - claim.bytes) / claim.bytes;
  check(
    `${key}: matches its declared size`,
    drift <= TOLERANCE,
    `measured ${formatSize(found.size)}, declared ${formatSize(claim.bytes)} (${(drift * 100).toFixed(2)}%)`
  );
  check(
    `${key}: under its ${formatSize(claim.budget)} budget`,
    found.passed === true,
    found.passed ? 'ok' : 'over budget'
  );
}

// The docs are what readers believe; a declared value they do not quote is a value nobody can check.
for (const [file, keys] of Object.entries(DOC_QUOTES)) {
  const doc = readFileSync(join(root, file), 'utf8');
  for (const key of keys) {
    const quoted = formatSize(EXPECTED_SIZES[key].bytes);
    check(
      `${file} quotes ${key} as ${quoted}`,
      doc.includes(quoted),
      doc.includes(quoted) ? 'quoted' : 'missing or different'
    );
  }
}

const failed = checks.filter((c) => !c.ok).length;
if (checks.length !== EXPECTED_COUNTS.sizes) {
  console.error(`size claims: ran ${checks.length} checks, expected-counts.mjs declares ${EXPECTED_COUNTS.sizes}`);
  process.exit(1);
}
if (failed > 0) {
  console.error(`\nsize claims: ${checks.length - failed}/${checks.length} checks passed`);
  console.error('If the measurement genuinely moved, update EXPECTED_SIZES in scripts/expected-counts.mjs');
  console.error('and the sizes quoted in docs/verification.md and STATUS.md together.');
  process.exit(1);
}
console.log(`\nsize claims: ${checks.length}/${checks.length} checks passed — the build and the docs agree`);
