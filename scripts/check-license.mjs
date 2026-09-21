#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>
/**
 * @trade/ui — licence contract.
 *
 * The project is dual-licensed (MIT OR Apache-2.0). The terms only travel with the code if the
 * headers do, and a rule without a gate rots — so this asserts:
 *
 *   1. every source file carries an `SPDX-License-Identifier`
 *   2. the licence files exist (LICENSE, LICENSE-MIT, LICENSE-APACHE)
 *   3. every package manifest declares the dual licence
 *
 * Non-headerable files (JSON, HTML, the committed baseline PNGs) are covered by REUSE.toml.
 * Exit code 0 = the contract holds.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const LICENSE = 'MIT OR Apache-2.0';
const SOURCE_EXT = new Set(['.mjs', '.js', '.ts', '.tsx', '.jsx', '.css', '.py']);

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });

// ---- 1. licence files exist and agree ----
for (const file of ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE']) {
  check(`licence file present: ${file}`, existsSync(resolve(root, file)), existsSync(resolve(root, file)) ? 'ok' : 'MISSING');
}
const licence = readFileSync(resolve(root, 'LICENSE'), 'utf8');
check('LICENSE names the dual licence', licence.includes(LICENSE), LICENSE);

// ---- 2. every package manifest declares the dual licence ----
const manifests = ['package.json', 'packages/ui/package.json', 'packages/tokens/package.json'].filter((p) =>
  existsSync(resolve(root, p))
);
for (const manifest of manifests) {
  const pkg = JSON.parse(readFileSync(resolve(root, manifest), 'utf8'));
  check(`${manifest} declares "${LICENSE}"`, pkg.license === LICENSE, `license = ${JSON.stringify(pkg.license)}`);
}

// ---- 3. every source file carries an SPDX header ----
// build output and vendored trees are not source: dist/ is generated, and it is gitignored
const PRUNE = new Set(['node_modules', 'dist', 'verification', 'baselines', '.git']);
const sourceFiles = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (PRUNE.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (SOURCE_EXT.has(extname(full))) sourceFiles.push(full);
  }
};
for (const dir of ['scripts', 'tests', 'packages/ui/src', 'packages/ui/styles', 'harness/src', 'apps']) walk(resolve(root, dir));
for (const file of ['packages/tokens/build-tokens.mjs', 'packages/ui/build.mjs']) {
  if (existsSync(resolve(root, file))) sourceFiles.push(resolve(root, file));
}

const missingHeader = sourceFiles.filter((file) => {
  const head = readFileSync(file, 'utf8').slice(0, 600);
  return !head.includes('SPDX-License-Identifier');
});
check(
  `every source file carries an SPDX-License-Identifier (${sourceFiles.length} files)`,
  missingHeader.length === 0,
  missingHeader.length ? `missing: ${missingHeader.slice(0, 5).map((f) => relative(root, f)).join(', ')}` : 'clean'
);

const passed = checks.filter((c) => c.pass).length;
console.log(`licence contract: ${passed}/${checks.length} checks passed (${sourceFiles.length} source files)`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
process.exit(passed === checks.length ? 0 : 1);
