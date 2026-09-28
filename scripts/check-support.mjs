#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * @trade/ui — the browser floor.
 *
 * The floor is not chosen, it is implied: it is the maximum of the baselines of the features the
 * library actually uses, taking only those without a fallback, because a feature that degrades
 * gracefully does not exclude an engine. `:focus-visible` is the binding one — on an engine without it
 * keyboard users get no focus ring at all (issue #39), which is why the floor sits at Safari 15.4
 * rather than anywhere newer.
 *
 * This holds docs/support.md to that derivation:
 *
 *   1. every feature the matrix describes is used by the code it claims to describe,
 *   2. every registered feature is named in the document,
 *   3. the floor stated in the document *is* the maximum the registered features imply.
 *
 * What it does not do, and says so in the document: it cannot notice a feature the stylesheets start
 * using that nobody registered. Records the same way `expected-counts.mjs` does — adding a feature to
 * the registry is part of using it.
 *
 * Baselines are from mdn/browser-compat-data (`main`). `null` means the engine has no implementation.
 *
 * Exit code 0 = the document and the code agree about which browsers are supported.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS } from './counts/support.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = 'docs/support.md';

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// `scope` is where the feature is allowed to live: a feature the library does not ship must not be
// presented as part of the library's floor.
const SCOPES = {
  library: ['packages/ui/styles', 'packages/ui/src'],
  source: ['packages/ui/src'],
  example: ['apps/example/src', 'apps/example-trading/src']
};

const FEATURES = [
  { name: ':focus-visible', pattern: /:focus-visible/, scope: 'library', setsFloor: true, chrome: 86, firefox: 85, safari: '15.4' },
  { name: 'dvh', pattern: /[0-9]dvh\b/, scope: 'library', setsFloor: false, chrome: 108, firefox: 101, safari: '15.4' },
  { name: 'accent-color', pattern: /accent-color\s*:/, scope: 'library', setsFloor: false, chrome: 93, firefox: 92, safari: '15.4' },
  { name: ':dir()', pattern: /:dir\(/, scope: 'library', setsFloor: false, chrome: 120, firefox: 49, safari: '16.4' },
  { name: 'inset-inline', pattern: /inset-inline|padding-block|margin-inline|inline-start|inline-end|border-inline/, scope: 'library', setsFloor: false, chrome: 87, firefox: 63, safari: '14.1' },
  { name: 'flex gap', doc: 'flex `gap`', pattern: /[^-]gap\s*:/, scope: 'library', setsFloor: false, chrome: 57, firefox: 52, safari: '10.1' },
  { name: '@supports selector()', pattern: /@supports[^{]*selector\(/, scope: 'library', setsFloor: false, chrome: 83, firefox: 69, safari: '14.1' },
  { name: 'position: sticky', pattern: /position\s*:\s*sticky/, scope: 'library', setsFloor: false, chrome: 56, firefox: 32, safari: '13' },
  { name: 'text-size-adjust', pattern: /text-size-adjust\s*:/, scope: 'library', setsFloor: false, chrome: 54, firefox: null, safari: null },
  { name: 'optional chaining / nullish coalescing', doc: 'optional chaining, nullish coalescing', pattern: /\?\.|\?\?/, scope: 'source', setsFloor: false, chrome: 80, firefox: 74, safari: '13.1' },
  { name: 'scrollbar-width', pattern: /scrollbar-width\s*:/, scope: 'example', setsFloor: false, chrome: 121, firefox: 64, safari: '18.2' }
];

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|ts|tsx|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
};
const scopeText = (scope) =>
  SCOPES[scope]
    .map((dir) => resolve(root, dir))
    .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())
    .flatMap((dir) => walk(dir))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

const doc = readFileSync(resolve(root, DOC), 'utf8');
const text = Object.fromEntries(Object.keys(SCOPES).map((s) => [s, scopeText(s)]));

// 1. a row that describes something the library does not ship is a claim about nothing
const phantom = FEATURES.filter((f) => !f.pattern.test(text[f.scope])).map((f) => `${f.name} (${f.scope})`);
check(
  'every feature in the matrix is used by the code it describes',
  phantom.length === 0,
  phantom.length ? `not found: ${phantom.join(', ')}` : `${FEATURES.length} features`
);

// 2. the document is the deliverable; a registry entry nobody can read is bookkeeping without a reader.
//    `doc` is the string that has to appear there, so a row may be worded for a reader rather than
//    for the registry.
const unnamed = FEATURES.filter((f) => !doc.includes(f.doc ?? f.name)).map((f) => f.name);
check(
  `${DOC} names every registered feature`,
  unnamed.length === 0,
  unnamed.length ? `missing: ${unnamed.join(', ')}` : `${FEATURES.length} features`
);

// 3. the stated floor must be the derived one. Only features without a fallback bind: everything else
//    degrades, and the document lists what each degradation costs.
const binding = FEATURES.filter((f) => f.setsFloor);
const maxOf = (key) =>
  binding
    .map((f) => f[key])
    .filter((v) => v !== null)
    .sort((a, b) => {
      const [am, an = '0'] = String(a).split('.');
      const [bm, bn = '0'] = String(b).split('.');
      return Number(am) - Number(bm) || Number(an.padEnd(3, '0')) - Number(bn.padEnd(3, '0'));
    })
    .pop();
const derived = { chrome: maxOf('chrome'), firefox: maxOf('firefox'), safari: maxOf('safari') };
const stated = doc.match(/Floor:\s*Chrome\s*([\d.]+)\s*·\s*Firefox\s*([\d.]+)\s*·\s*Safari\s*([\d.]+)/);
check(
  `the stated floor is the one the shipped features imply`,
  Boolean(stated) && stated[1] === String(derived.chrome) && stated[2] === String(derived.firefox) && stated[3] === String(derived.safari),
  stated
    ? `document says Chrome ${stated[1]} · Firefox ${stated[2]} · Safari ${stated[3]}; the registry implies Chrome ${derived.chrome} · Firefox ${derived.firefox} · Safari ${derived.safari}`
    : `no "Floor: Chrome … · Firefox … · Safari …" line in ${DOC}`
);

const failed = checks.filter((c) => !c.ok);
if (checks.length !== EXPECTED_COUNTS.support) {
  console.error(`support: ran ${checks.length} checks, scripts/counts/support.mjs declares ${EXPECTED_COUNTS.support}`);
  process.exit(1);
}
if (failed.length > 0) {
  console.error(`\nsupport: ${checks.length - failed.length}/${checks.length} checks passed`);
  console.error('The floor is derived, not chosen. Fix the registry or the document so they agree (docs/support.md).');
  process.exit(1);
}
console.log(
  `\nsupport: ${checks.length}/${checks.length} checks passed — the document and the code agree on Chrome ${derived.chrome} · Firefox ${derived.firefox} · Safari ${derived.safari}`
);
