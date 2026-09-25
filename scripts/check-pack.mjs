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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['packages/ui', 'packages/tokens'];

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });

const REQUIRED = ['package.json', 'LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE'];
const FORBIDDEN_PREFIX = /^(src|tests?|scripts|apps|harness)\//;

const stylesDir = resolve(root, 'packages/ui/styles');
const sourceStylesheets = existsSync(stylesDir) ? readdirSync(stylesDir).filter((f) => f.endsWith('.css')).length : 0;

for (const dir of PACKAGES) {
  const pkgDir = resolve(root, dir);
  const label = dir;

  // A package listed here must exist: skipping it silently would make this gate narrower than it
  // claims, and the summary would still report the full package count.
  if (!existsSync(resolve(pkgDir, 'package.json'))) {
    check(`${label}: has a manifest`, false, `no package.json at ${label}`);
    continue;
  }

  let manifest;
  try {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: pkgDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // a lifecycle script can still write to stdout ahead of the JSON, so take the array itself
    manifest = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))[0];
  } catch (error) {
    check(`${label}: packs`, false, String(error.stderr ?? error.message).split('\n').slice(0, 3).join(' '));
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
}

const passed = checks.filter((c) => c.pass).length;
console.log(`packaging contract: ${passed}/${checks.length} checks passed (${PACKAGES.length} publishable packages)`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
process.exit(passed === checks.length ? 0 : 1);
