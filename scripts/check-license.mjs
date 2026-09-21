#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>
/**
 * @trade/ui — licence contract.
 *
 * The project is dual-licensed (MIT OR Apache-2.0). The terms only travel with the code if the
 * headers do, and a rule without a gate rots — so this asserts:
 *
 *   1. the licence files exist (LICENSE, LICENSE-MIT, LICENSE-APACHE, NOTICE)
 *   2. every workspace manifest — discovered from the root `workspaces` globs, not a hand-list —
 *      declares the dual licence
 *   3. every source file opens with the exact SPDX identifier *and* the copyright line
 *   4. every publishable package lists the licence files so they reach the npm tarball
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
const LICENCE_FILES = ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE'];

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });

const rootPkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// ---- 1. licence files exist and agree ----
for (const file of LICENCE_FILES) {
  check(`licence file present: ${file}`, existsSync(resolve(root, file)), existsSync(resolve(root, file)) ? 'ok' : 'MISSING');
}
check('LICENSE names the dual licence', readFileSync(resolve(root, 'LICENSE'), 'utf8').includes(LICENSE), LICENSE);

// ---- 2. every workspace manifest declares the dual licence ----
// Discovered from the root `workspaces` globs so a new package cannot slip past the gate.
const workspaceDirs = [];
for (const pattern of rootPkg.workspaces ?? []) {
  const parent = resolve(root, pattern.replace(/\/\*$/, ''));
  if (!existsSync(parent)) continue;
  for (const entry of readdirSync(parent)) {
    const dir = join(parent, entry);
    if (statSync(dir).isDirectory() && existsSync(join(dir, 'package.json'))) workspaceDirs.push(dir);
  }
}
const manifests = [root, ...workspaceDirs];
for (const dir of manifests) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const label = relative(root, dir) || '.';
  check(`${label}/package.json declares "${LICENSE}"`, pkg.license === LICENSE, `license = ${JSON.stringify(pkg.license)}`);
}

// ---- 3. every source file carries the full SPDX header ----
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

const ID_RE = new RegExp(`SPDX-License-Identifier:\\s*${LICENSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
const CR_RE = /SPDX-FileCopyrightText:\s*\S+/;
const badHeader = sourceFiles.filter((file) => {
  const head = readFileSync(file, 'utf8').slice(0, 600);
  return !ID_RE.test(head) || !CR_RE.test(head);
});
check(
  `every source file opens with the exact SPDX id + copyright line (${sourceFiles.length} files)`,
  badHeader.length === 0,
  badHeader.length ? `bad: ${badHeader.slice(0, 5).map((f) => relative(root, f)).join(', ')}` : 'clean'
);

// ---- 4. publishable packages ship the terms ----
for (const dir of workspaceDirs) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (pkg.private === true) continue;
  const files = pkg.files ?? [];
  const missing = LICENCE_FILES.filter((f) => !files.includes(f));
  const label = relative(root, dir);
  check(`${label} publishes the licence files`, missing.length === 0, missing.length ? `files missing: ${missing.join(', ')}` : 'ok');
}

const passed = checks.filter((c) => c.pass).length;
console.log(`licence contract: ${passed}/${checks.length} checks passed (${sourceFiles.length} source files, ${manifests.length} manifests)`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
process.exit(passed === checks.length ? 0 : 1);
