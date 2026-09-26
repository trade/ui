#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * @trade/ui — packaging contract.
 *
 * `check-contract.mjs` asserts what the manifests *say* (the `files` list, the exports map, the
 * artifacts on disk). It cannot catch an artifact that is declared correctly and still packs wrong
 * — which has already happened once: #55's tarballs shipped with no licence files at all, because
 * npm only packs files that exist inside the package directory, and only a human reading the diff
 * noticed.
 *
 * So this packs each publishable package for real (`npm pack --dry-run`) and inspects the file list:
 *
 *   1. every entry point in `main`/`module`/`types`/`exports` resolves to a file in the tarball
 *   2. the licence files and the build output are present
 *   3. every per-component stylesheet the build promises is present
 *   4. source, tests, scripts, examples, maps and `node_modules` never leak in
 *
 * Exit code 0 = both tarballs are what a consumer would receive.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS } from './expected-counts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['packages/ui', 'packages/tokens'];

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });

const REQUIRED = ['package.json', 'LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE'];
const FORBIDDEN_PREFIX = /^(src|tests?|scripts|apps|harness)\//;

const stylesDir = resolve(root, 'packages/ui/styles');
const sourceStylesheets = existsSync(stylesDir) ? readdirSync(stylesDir).filter((f) => f.endsWith('.css')).length : 0;

/**
 * How to invoke npm. `execFileSync('npm', ...)` cannot work on Windows: there is no `npm`
 * executable there, only `npm.cmd`, and Node refuses to spawn a `.cmd` without a shell (EINVAL).
 * So the command was unrunnable on win32 — this gate could never pass there, and on Linux CI it
 * passed, which is why nobody upstream noticed.
 *
 * The fix is npm's own CLI entry point rather than a shell. Under `npm run`, npm exports
 * `npm_execpath` (the absolute path of npm-cli.js). That is a .js file, so it cannot be the
 * command execFileSync runs — it is the SCRIPT, and node itself is the command. Verified on
 * win32: running `process.execPath npm_execpath pack …` succeeds where both `npm` (ENOENT) and
 * `npm.cmd` (EINVAL) fail.
 *
 * The shell is a fallback only, for running this file directly (`node scripts/check-pack.mjs`),
 * where `npm_execpath` is absent. It is not the primary path on purpose: `shell: true` re-opens
 * argument-injection surface, and the argument list here is fixed literals, so there is no
 * reason to prefer it when a shell-free route exists.
 */
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : 'npm';
const npmArgs = (args) => (npmCli ? [npmCli, ...args] : args);
const npmOptions = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...(npmCli ? {} : { shell: true }) };

for (const dir of PACKAGES) {
  const pkgDir = resolve(root, dir);
  const label = dir;

  // A package listed here must exist: skipping it silently would make this gate narrower than it
  // claims, and the summary would still report the full package count.
  if (!existsSync(resolve(pkgDir, 'package.json'))) {
    check(`${label}: has a manifest`, false, `no package.json at ${label}`);
    // Same reasoning as the catch below: with no manifest there is nothing to pack and nothing
    // to assert, so say the pack never ran rather than leaving the absence implicit.
    check(`${label}: npm pack produced a real manifest`, false, 'no manifest — the pack command did not run');
    continue;
  }

  let manifest;
  try {
    const out = execFileSync(npmCommand, npmArgs(['pack', '--dry-run', '--json']), { cwd: pkgDir, ...npmOptions });
    // a lifecycle script can still write to stdout ahead of the JSON, so take the array itself
    manifest = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))[0];
  } catch (error) {
    check(`${label}: packs`, false, String(error.stderr ?? error.message).split('\n').slice(0, 3).join(' '));
    // The command itself is broken, so every assertion below would be vacuous. Say so with a
    // named check instead of skipping them silently: a gate that reports "0/2 packages" and a
    // bare spawn error reads like a packaging regression, when the truth is that no tarball
    // was ever built. This is the check that distinguishes the two.
    check(`${label}: npm pack produced a real manifest`, false, 'no manifest — the pack command did not run');
    continue;
  }

  const packed = new Set(manifest.files.map((f) => f.path));
  const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'));

  // 1. declared entry points must exist in the tarball — a dangling "main" ships broken to CJS users
  const entries = new Map();
  if (pkg.main) entries.set('main', pkg.main);
  if (pkg.module) entries.set('module', pkg.module);
  if (pkg.types) entries.set('types', pkg.types);
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (typeof target === 'string') entries.set(`exports["${key}"]`, target);
    else for (const [condition, file] of Object.entries(target)) entries.set(`exports["${key}"].${condition}`, file);
  }
  const dangling = [...entries].filter(([, file]) => {
    const target = posix.normalize(String(file));
    if (target.includes('*')) {
      // a wildcard export (./components/*) resolves if any packed file sits under its prefix
      const prefix = target.slice(0, target.indexOf('*'));
      return ![...packed].some((f) => f.startsWith(prefix));
    }
    return !packed.has(target);
  });
  check(
    `${label}: every declared entry point exists in the tarball`,
    dangling.length === 0,
    dangling.length ? dangling.map(([k, f]) => `${k} -> ${f}`).join(', ') : `${entries.size} entry points`
  );

  // 2. required files
  const missing = REQUIRED.filter((f) => !packed.has(f));
  check(`${label}: ships the licence files and its manifest`, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'ok');

  // 3. the per-component stylesheets the build promises — a wildcard export would otherwise pass
  //    with any single file present, so compare against the source set rather than "at least one"
  if (dir === 'packages/ui') {
    const shipped = [...packed].filter((f) => f.startsWith('dist/components/') && f.endsWith('.css'));
    check(
      `${label}: ships every per-component stylesheet`,
      shipped.length === sourceStylesheets && sourceStylesheets > 0,
      `${shipped.length} of ${sourceStylesheets}`
    );
  }

  // 4. nothing that should not be published. `dist/` holds build output — including the tokens
  //    package's dist/tokens.ts, which is published on purpose — but it is not a blanket exemption:
  //    the build emits no source maps, so a .map anywhere is a leak, not an artefact.
  const leaked = [...packed].filter((f) => {
    if (FORBIDDEN_PREFIX.test(f)) return true;
    if (/node_modules/.test(f)) return true;
    if (/\.map$/.test(f)) return true;
    if (/\.ts$/.test(f) && !f.startsWith('dist/')) return true;
    return false;
  });
  check(`${label}: leaks no source, tests, scripts, maps or node_modules`, leaked.length === 0, leaked.length ? `leaked: ${leaked.slice(0, 5).join(', ')}` : `${packed.size} files`);

  // 5. the build output is actually in there
  // the UI package ships the bundle plus per-component CSS; tokens ships its CSS and TS module
  const distFiles = [...packed].filter((f) => f.startsWith('dist/'));
  const expectedDist = dir === 'packages/ui' ? 4 : 1;
  check(
    `${label}: ships the build output`,
    distFiles.length >= expectedDist,
    `${distFiles.length} files under dist/ (expected >= ${expectedDist})`
  );

  // 6. the npm invocation above actually ran. Without this the whole gate was silently
  //    vacuous on any platform where `npm` is not directly spawnable: the catch above recorded
  //    the spawn error as a per-package FAIL, so the gate still exited 1, but nothing asserted
  //    that a real tarball had been produced — the failure mode looked like a packaging
  //    regression when it was a broken command. Now the manifest must carry a plausible file
  //    count, which only a successful `npm pack` can produce. This is the check that would
  //    have caught the win32 ENOENT at the point of introduction rather than in a bug report.
  check(
    `${label}: npm pack produced a real manifest`,
    manifest && Array.isArray(manifest.files) && manifest.files.length > 0,
    manifest ? `${manifest.files?.length ?? 0} entries, ${manifest.size ?? '?'} bytes packed` : 'no manifest'
  );
}

const passed = checks.filter((c) => c.pass).length;
console.log(`packaging contract: ${passed}/${checks.length} checks passed (${PACKAGES.length} publishable packages)`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
// Rule zero, both ends: this suite owns its own total, and check:docs reads the same number to
// keep README honest. Before this the count was declared in expected-counts.mjs but never
// compared here, so adding a check moved the docs out of step with the suite and only
// check:docs noticed — one gate deep, after the fact.
if (checks.length !== EXPECTED_COUNTS.pack) {
  console.error(
    `check:pack: ${checks.length} checks ran but scripts/expected-counts.mjs declares ${EXPECTED_COUNTS.pack}. ` +
      'Update that number and the docs it feeds in the same change, then run check:docs.'
  );
  process.exit(1);
}
process.exit(passed === checks.length ? 0 : 1);
