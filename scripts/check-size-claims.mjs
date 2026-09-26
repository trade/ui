// SPDX-License-Identifier: MIT OR Apache-2.0

// The documented size claims, checked against the real measurement.
//
// `npm run size` measures what a consumer ships; this script runs it and holds two things to it:
//
//   1. the measurement still matches the values declared in `scripts/expected-counts.mjs`, and
//   2. every document that states a measured size states it in the right cell of the right row.
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
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS, EXPECTED_SIZES, formatSize } from './expected-counts.mjs';

const TOLERANCE = 0.01; // 1% of the declared size — a real drift, not a byte of minifier noise
const root = fileURLToPath(new URL('..', import.meta.url)); // fileURLToPath, not .pathname: a checkout path with a space would otherwise break the lookup
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Each document has its own row shape, so each is matched as a row and not as a substring of the file:
// a table cell that drifts while the same number survives in the prose below it is exactly the kind of
// change a whole-file `includes()` would wave through.
const ROW = {
  'docs/verification.md': (label, budget, value) =>
    new RegExp(`^\\|\\s*${escapeRe(label)}\\s*\\|\\s*${escapeRe(budget)}\\s*\\|\\s*${escapeRe(value)}\\s*\\|`, 'm'),
  'STATUS.md': (label, budget, value) =>
    new RegExp(`^\\|\\s*${escapeRe(label)}\\s*\\|\\s*\\*\\*${escapeRe(value)}\\*\\*\\s*min\\+gzip\\s*\\(budget\\s*${escapeRe(budget)}\\)`, 'm')
};

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// Read the measurement; do not trust a cached one. size-limit exits non-zero when a budget fails but
// still prints the figures, so a breach is reported per entry below rather than as a crash.
let measured;
try {
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'size-limit.cmd' : 'size-limit');
  const stdout = execFileSync(bin, ['--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  measured = JSON.parse(stdout);
} catch (error) {
  try {
    measured = JSON.parse(error.stdout);
  } catch {
    console.error('size claims: could not measure — is the build present? (npm run build)');
    console.error(String(error.stdout || error.message).slice(0, 600));
    process.exit(1);
  }
}

const byName = new Map(measured.map((entry) => [entry.name, entry]));
const entries = Object.entries(EXPECTED_SIZES);

// The sets must be equal, not merely overlapping. A new size-limit entry that nobody declares would
// otherwise be measured and then ignored — including by the error path above, which would swallow its
// budget failure and still report a clean run.
const missing = entries.filter(([, claim]) => !byName.has(claim.entry)).map(([key]) => key);
const undeclared = measured.filter((entry) => !entries.some(([, claim]) => claim.entry === entry.name)).map((entry) => entry.name);
check(
  'the measured artifacts are exactly the declared ones',
  missing.length === 0 && undeclared.length === 0,
  missing.length || undeclared.length
    ? `missing ${missing.join(', ') || 'none'}; undeclared ${undeclared.join(', ') || 'none'}`
    : `${entries.length} declared, ${measured.length} measured`
);

for (const [key, claim] of entries) {
  const found = byName.get(claim.entry);
  if (!found) {
    check(`${key}: matches its declared size`, false, 'not measured');
    check(`${key}: within its declared budget`, false, 'not measured');
    check(`${key}: declared budget agrees with package.json`, false, 'not measured');
    continue;
  }
  const drift = Math.abs(found.size - claim.bytes) / claim.bytes;
  check(
    `${key}: matches its declared size`,
    drift <= TOLERANCE,
    `measured ${formatSize(found.size)}, declared ${formatSize(claim.bytes)} (${(drift * 100).toFixed(2)}%)`
  );
  // Compare against the budget printed in the docs, not size-limit's own verdict, so the ceiling in the
  // message is the ceiling the reader is shown.
  check(
    `${key}: within its declared budget`,
    found.size <= claim.budget,
    `${formatSize(found.size)} of ${claim.budgetLabel}`
  );
  check(
    `${key}: declared budget agrees with package.json`,
    found.sizeLimit === claim.budget,
    `package.json says ${formatSize(found.sizeLimit)}, this module declares ${claim.budgetLabel}`
  );
}

// The docs are what readers believe; a value that is not in the right cell is not a value they can check.
for (const [key, claim] of entries) {
  const value = formatSize(claim.bytes);
  for (const [file, label] of Object.entries(claim.docs)) {
    const doc = readFileSync(join(root, file), 'utf8');
    const ok = ROW[file](label, claim.budgetLabel, value).test(doc);
    check(`${file} states ${key} as ${value} in its row`, ok, ok ? `"${label}"` : `no row "${label} | ${claim.budgetLabel} | ${value}"`);
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
  console.error('and the sizes stated in docs/verification.md and STATUS.md together.');
  process.exit(1);
}
console.log(`\nsize claims: ${checks.length}/${checks.length} checks passed — the build and the docs agree`);
