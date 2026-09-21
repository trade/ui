#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

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

// 5. published files stay minimal
const files = ui.files ?? [];
check('publishes only dist', files.length === 1 && files[0] === 'dist', `files = ${JSON.stringify(files)}`);

// 6. build output exists and is non-trivial
for (const f of ['packages/ui/dist/index.js', 'packages/ui/dist/index.cjs', 'packages/ui/dist/ui.css', 'packages/ui/dist/index.d.ts']) {
  const abs = resolve(root, f);
  check(`build artifact present: ${f.replace('packages/ui/dist/', '')}`, existsSync(abs), existsSync(abs) ? `${readFileSync(abs).length} bytes` : 'MISSING — run npm run build');
}

const passed = checks.filter((c) => c.pass).length;
console.log(`contract: ${passed}/${checks.length} checks passed`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
process.exit(passed === checks.length ? 0 : 1);
