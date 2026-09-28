#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * @trade/ui — package contract check.
 *
 * These are the promises the library makes to consumers. They are cheap to assert and
 * catastrophic to break silently, so they run in CI on every change.
 *
 * Exit code 0 = the contract holds.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS } from './counts/contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });

const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const ui = read('packages/ui/package.json');
const tokens = read('packages/tokens/package.json');

// 1. zero runtime dependencies — the headline promise
const deps = Object.keys(ui.dependencies ?? {});
check('@trade/ui has zero runtime dependencies', deps.length === 0, `dependencies = ${JSON.stringify(ui.dependencies ?? {})}`);
const tokenDeps = Object.keys(tokens.dependencies ?? {});
check('@trade/tokens has zero runtime dependencies', tokenDeps.length === 0, `dependencies = ${JSON.stringify(tokens.dependencies ?? {})}`);

// 2. React must never be bundled or installed by us
check('React is a peer, not a dependency', Boolean(ui.peerDependencies?.react) && !('react' in (ui.dependencies ?? {})), `peerDependencies = ${JSON.stringify(ui.peerDependencies ?? {})}`);
check('React DOM is a peer, not a dependency', Boolean(ui.peerDependencies?.['react-dom']) && !('react-dom' in (ui.dependencies ?? {})), `peerDependencies = ${JSON.stringify(ui.peerDependencies ?? {})}`);

// 3. tree-shaking
check('sideEffects is false (tree-shakeable)', ui.sideEffects === false, `sideEffects = ${JSON.stringify(ui.sideEffects)}`);

// 4. the exports map consumers rely on
check('exports map exposes JS', Boolean(ui.exports?.['.']?.import && ui.exports?.['.']?.require && ui.exports?.['.']?.types), Object.keys(ui.exports ?? {}).join(', '));
check('exports map exposes the stylesheet', ui.exports?.['./styles.css'] === './dist/ui.css', `./styles.css = ${ui.exports?.['./styles.css']}`);

// 5. published files stay minimal — the build output plus the licence terms the package declares
const ALLOWED_FILES = new Set(['dist', 'LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE']);
const files = ui.files ?? [];
check(
  'publishes dist plus the licence files, nothing else',
  files.includes('dist') && files.every((f) => ALLOWED_FILES.has(f)),
  `files = ${JSON.stringify(files)}`
);

// 6. build output exists and is non-trivial
for (const f of ['packages/ui/dist/index.js', 'packages/ui/dist/index.cjs', 'packages/ui/dist/ui.css', 'packages/ui/dist/index.d.ts']) {
  const abs = resolve(root, f);
  check(`build artifact present: ${f.replace('packages/ui/dist/', '')}`, existsSync(abs), existsSync(abs) ? `${readFileSync(abs).length} bytes` : 'MISSING — run npm run build');
}

// 7. one version, one meaning (issue #76)
// The token schema carried `version: 0.2.0` inside packages that declare 0.1.0, and the build emitted
// it as the package version into both shipped artifacts. Nothing asserted anything about version, in
// any file, so nothing could notice. The schema key is renamed, the build emits the package version,
// and the two are held together here.
const rootPkg = read('package.json');
const schema = JSON.parse(readFileSync(resolve(root, 'packages/tokens/tokens.json'), 'utf8'));
const versions = { root: rootPkg.version, ui: ui.version, tokens: tokens.version };
check(
  'every manifest declares the same version',
  new Set(Object.values(versions)).size === 1 && Boolean(ui.version),
  Object.entries(versions).map(([k, v]) => `${k}=${v}`).join(', ')
);
check(
  'the token schema version is named schemaVersion, not version',
  typeof schema.schemaVersion === 'string' && !('version' in schema),
  `schemaVersion=${JSON.stringify(schema.schemaVersion)}, version=${JSON.stringify(schema.version)}`
);
const tokensCss = resolve(root, 'packages/tokens/dist/tokens.css');
const cssHeader = existsSync(tokensCss) ? (readFileSync(tokensCss, 'utf8').split('\n')[1] ?? '').trim() : '';
check(
  'the emitted stylesheet names the package version',
  cssHeader.includes(`v${ui.version}`),
  cssHeader.slice(0, 96) || 'no header — run npm run build'
);
// `"version"` exactly: `"schemaVersion"` has no quote before it, so the two cannot be confused.
const tokensTs = resolve(root, 'packages/tokens/dist/tokens.ts');
const moduleVersion = existsSync(tokensTs) ? (readFileSync(tokensTs, 'utf8').match(/"version": "([^"]+)"/) ?? [])[1] : undefined;
check(
  'the emitted token module exports the package version',
  moduleVersion === ui.version,
  `module says ${moduleVersion ?? 'nothing'}, the manifests say ${ui.version}`
);

const passed = checks.filter((c) => c.pass).length;
if (checks.length !== EXPECTED_COUNTS.contract) {
  console.error(`contract: ran ${checks.length} checks, scripts/counts/contract.mjs declares ${EXPECTED_COUNTS.contract}`);
  process.exit(1);
}
console.log(`contract: ${passed}/${checks.length} checks passed`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
process.exit(passed === checks.length ? 0 : 1);
