#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * @trade/ui — trading dogfood: the deepest consumer, against the packed tarball.
 *
 * `verify-consumer.mjs` proves the tarball works — with a minimal probe built by this repository.
 * The deepest consumer the repository has, though, is `apps/example-trading`, and inside the
 * monorepo it resolves `@trade/ui` through npm's hoisted workspace symlink: the app and the library
 * are still written by the same author. A file present in `dist/` here but absent from the tarball
 * loads perfectly in the workspace and breaks only when a consumer installs it.
 *
 * So this gate takes the real app and forces its resolution through what a stranger would install:
 *
 *   1. `npm pack` @trade/ui for real (no --dry-run) into a scratch directory
 *   2. copy the app's sources into a project **outside the repository** and install the tarball
 *   3. assert the installed copy is a real directory — a symlink would mean the workspace is
 *      being tested again, which is the exact illusion this gate exists to break
 *   4. resolve `@trade/ui/styles.css` through the installed copy and fail if it lands anywhere else
 *   5. bundle the screen with the same settings the real build uses (`scripts/build-example-trading.mjs`)
 *   6. assert the bundle carries the screen and the library, and that nothing is left external
 *
 * Hermetic: the package declares zero runtime dependencies (asserted by check-contract.mjs), so the
 * install needs no network, and React — a peer the consumer is expected to provide — is linked in
 * from this repository rather than downloaded.
 *
 * Exit code 0 = the trading example builds from what a stranger would install.
 *
 * `--keep` leaves the scratch project behind and prints its path.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS } from './counts/consumer-trading.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP_SRC = resolve(root, 'apps', 'example-trading', 'src');
const PACKAGE = { dir: 'packages/ui', name: '@trade/ui' };

// A string only the screen carries, and a class the library's components render: together they say
// the bundle contains the real screen and the real library, not a stub. The class name appears in
// JS without the `.` selector prefix — in this bundle `ui-btn`, in a stylesheet `.ui-btn`.
const SCREEN_MARKER = 'AAPL';
const JS_CLASS_MARKER = 'ui-btn';
const CSS_SELECTOR = '.ui-btn';

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const run = (bin, args, options) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const read = (file) => readFileSync(file, 'utf8');

// Same npm invocation technique as verify-consumer.mjs: `npm` is not an executable on Windows, and
// Node cannot spawn a `.cmd` without a shell -- so under `npm run`, npm's own CLI entry point
// (`npm_execpath`) runs through `process.execPath` and the shell is never needed.
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : 'npm';
const npmArgs = (args) => (npmCli ? [npmCli, ...args] : args);
const npmOptions = (cwd) => ({ cwd, ...(npmCli ? {} : { shell: true }) });

/** Directory links only, so a junction works on Windows without Developer Mode or elevation. */
const linkDir = (from, to) => symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir');
const keep = process.argv.includes('--keep');
const work = mkdtempSync(join(tmpdir(), 'trade-ui-trading-'));
const tarballs = join(work, 'tarballs');
const consumer = join(work, 'consumer');
let cleaned = false;
const cleanup = () => {
  if (cleaned || keep) return;
  cleaned = true;
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* a scratch directory that will not delete is not a gate failure */
  }
};

console.log(`trading dogfood: rebuilding the example from the packed tarball in ${consumer}\n`);

try {
  // ── 1. the artifact the rebuild needs ─────────────────────────────────────
  // Fail, never skip: a missing build would make everything below vacuous while the summary still
  // reported a full run.
  const artifacts = ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/ui.css'];
  const missing = artifacts.filter((file) => !existsSync(resolve(root, PACKAGE.dir, file)));
  check(
    `${PACKAGE.name} is built`,
    missing.length === 0,
    missing.length ? `missing ${missing.join(', ')} — run \`npm run build\`` : `${artifacts.length} artifacts`
  );

  // ── 2. pack for real ──────────────────────────────────────────────────────
  mkdirSync(tarballs, { recursive: true });
  let tarball = null;
  let packError = null;
  try {
    const out = run(npmCommand, npmArgs(['pack', '--json', '--pack-destination', tarballs]), npmOptions(resolve(root, PACKAGE.dir)));
    const manifest = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))[0];
    tarball = join(tarballs, manifest.filename);
  } catch (error) {
    // `prepack` runs here (it copies the licence files in), so a broken lifecycle script surfaces
    // as a pack failure rather than weeks later as a consumer's 404.
    packError = String(error.stderr ?? error.message).split('\n').slice(0, 2).join(' ');
  }
  const tarballBytes = tarball && existsSync(tarball) ? statSync(tarball).size : 0;
  check(
    `${PACKAGE.name} packs a tarball`,
    tarballBytes > 0,
    tarballBytes > 0 ? `${basename(tarball)} (${tarballBytes} bytes)` : packError ?? 'no tarball written'
  );

  // ── 3. install into a project outside the repository ──────────────────────
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'trading-consumer', private: true, version: '0.0.0', type: 'module' }, null, 2) + '\n');
  let installError = null;
  if (tarballBytes > 0) {
    try {
      // Same rationale as verify-consumer.mjs: --offline is honest because the package has no
      // runtime dependencies, --omit=peer + --legacy-peer-deps keep npm from fetching React's
      // packument, and --ignore-scripts skips lifecycle scripts the tarball should not need.
      run(
        npmCommand,
        npmArgs(['install', tarball, '--omit=peer', '--legacy-peer-deps', '--no-audit', '--no-fund', '--ignore-scripts', '--offline']),
        npmOptions(consumer)
      );
    } catch (error) {
      installError = String(error.stderr ?? error.message).split('\n').slice(0, 3).join(' ');
    }
  } else {
    installError = 'no tarball — the pack step failed';
  }
  const installedPath = join(consumer, 'node_modules', PACKAGE.name);
  check(
    'the tarball installs into a project outside the repository',
    !installError && existsSync(installedPath),
    installError ?? `${PACKAGE.name} in ${consumer}`
  );

  // The discriminator. npm symlinks workspace packages; if that is what landed here, every check
  // below would be measuring `packages/ui` in the working tree.
  const isSymlink = existsSync(installedPath) && lstatSync(installedPath).isSymbolicLink();
  check(
    'the installed copy is a real directory, not a workspace link',
    existsSync(installedPath) && !isSymlink,
    isSymlink ? 'a symlink — the workspace is being tested, not the tarball' : 'published contents, not a link'
  );

  const added = existsSync(join(consumer, 'node_modules'))
    ? readdirSync(join(consumer, 'node_modules')).filter((name) => !name.startsWith('.'))
    : [];
  check(
    'the install pulls in nothing but the package itself',
    added.length === 1 && added[0] === '@trade',
    `node_modules holds ${added.join(', ') || 'nothing'}`
  );

  // The peer the app provides. Linked rather than downloaded so the gate stays offline.
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const from = join(root, 'node_modules', name);
    if (existsSync(from)) linkDir(from, join(consumer, 'node_modules', name));
  }

  // ── 4. the stylesheet, and only from the installed copy ───────────────────
  // Compare realpaths: on macOS the system temp directory is reached through a symlink, so Node
  // hands back /private/var/... while this script holds /var/... — a string prefix test would call
  // a perfectly good install "outside the consumer" (verify-consumer.mjs hit exactly that).
  const consumerModules = existsSync(join(consumer, 'node_modules')) ? realpathSync(join(consumer, 'node_modules')) : null;
  const insideConsumer = (file) => {
    if (!consumerModules || typeof file !== 'string') return false;
    try {
      return realpathSync(file).startsWith(consumerModules + sep);
    } catch {
      return false;
    }
  };
  let uiCss = null;
  let cssError = null;
  try {
    uiCss = createRequire(join(consumer, 'package.json')).resolve(`${PACKAGE.name}/styles.css`);
  } catch (error) {
    cssError = String(error.message);
  }
  check(
    `${PACKAGE.name}/styles.css resolves from the installed copy`,
    uiCss !== null && existsSync(uiCss) && insideConsumer(uiCss),
    cssError ?? uiCss ?? 'not resolved'
  );

  const cssBytes = uiCss && existsSync(uiCss) ? statSync(uiCss).size : 0;
  const cssSource = uiCss && existsSync(uiCss) ? read(uiCss) : '';
  const cssOk = cssBytes > 1000 && cssSource.includes(CSS_SELECTOR);
  check(
    'the resolved stylesheet carries the component styles',
    cssOk,
    cssOk ? `${cssBytes} bytes, contains ${CSS_SELECTOR}` : cssError ?? `${cssBytes} bytes, ${CSS_SELECTOR} absent`
  );

  // ── 5. rebuild the real screen, from the scratch project ──────────────────
  // The same shape as scripts/build-example-trading.mjs: copy the stylesheets and the page beside
  // the bundle, then bundle the screen as a self-contained IIFE — only the resolution differs now,
  // because the app resolves @trade/ui from the tarball installed above.
  mkdirSync(join(consumer, 'src'), { recursive: true });
  for (const file of readdirSync(APP_SRC)) {
    copyFileSync(join(APP_SRC, file), join(consumer, 'src', file));
  }
  const dist = join(consumer, 'dist');
  mkdirSync(dist, { recursive: true });
  if (uiCss && existsSync(uiCss)) copyFileSync(uiCss, join(dist, 'ui.css'));
  copyFileSync(join(APP_SRC, 'screen.css'), join(dist, 'screen.css'));
  copyFileSync(join(APP_SRC, 'index.html'), join(dist, 'index.html'));

  let bundleError = null;
  let metafile = null;
  try {
    const esbuild = await import('esbuild');
    const result = await esbuild.build({
      entryPoints: [join(consumer, 'src', 'main.jsx')],
      bundle: true,
      format: 'iife',
      jsx: 'automatic',
      target: ['es2020'],
      minify: true,
      outfile: join(dist, 'app.js'),
      define: { 'process.env.NODE_ENV': '"production"' },
      absWorkingDir: consumer,
      metafile: true,
      logLevel: 'silent'
    });
    metafile = result.metafile;
  } catch (error) {
    bundleError = error;
  }
  const js = existsSync(join(dist, 'app.js')) ? read(join(dist, 'app.js')) : '';
  check(
    'the trading example bundles against the installed copy',
    !bundleError && js.length > 0,
    bundleError ? String(bundleError.message).split('\n').slice(0, 2).join(' ') : `${js.length} bytes`
  );

  const markersOk = js.includes(SCREEN_MARKER) && js.includes(JS_CLASS_MARKER);
  check(
    'the bundle contains the real screen and the library',
    markersOk,
    markersOk ? `contains ${SCREEN_MARKER} and ${JS_CLASS_MARKER}` : `missing ${js.includes(SCREEN_MARKER) ? JS_CLASS_MARKER : SCREEN_MARKER}`
  );

  // An unresolved bare import would be reported as external and shipped to the browser as a
  // runtime error; an IIFE bundle must resolve everything.
  const output = metafile ? Object.values(metafile.outputs).find((o) => o.entryPoint) : null;
  const externals = (output?.imports ?? []).filter((i) => i.external).map((i) => i.path);
  check(
    'nothing is left external for the browser',
    metafile !== null && externals.length === 0,
    metafile === null ? 'no metafile — the bundle step failed' : externals.length ? `left external: ${externals.join(', ')}` : 'all imports resolved into the bundle'
  );

  // ── 6. the page the app opens points at what was built ────────────────────
  const distCss = existsSync(join(dist, 'ui.css')) ? read(join(dist, 'ui.css')) : '';
  const cssCopyOk = distCss.includes(CSS_SELECTOR);
  check(
    "the stylesheet copied beside the bundle is the library's",
    cssCopyOk,
    cssCopyOk ? `contains ${CSS_SELECTOR}` : `${CSS_SELECTOR} absent`
  );

  const html = existsSync(join(dist, 'index.html')) ? read(join(dist, 'index.html')) : '';
  const referenced = ['ui.css', 'screen.css', 'app.js'].filter((file) => html.includes(file));
  check(
    'index.html references the three built files',
    referenced.length === 3,
    referenced.length === 3 ? 'ui.css, screen.css, app.js' : `references only ${referenced.join(', ') || 'nothing'}`
  );
} finally {
  cleanup();
}

const failed = checks.filter((c) => !c.ok);
if (checks.length !== EXPECTED_COUNTS.consumerTrading) {
  console.error(`trading dogfood: ran ${checks.length} checks, scripts/counts/consumer-trading.mjs declares ${EXPECTED_COUNTS.consumerTrading}`);
  process.exit(1);
}
if (failed.length > 0) {
  console.error(`\ntrading dogfood: ${checks.length - failed.length}/${checks.length} checks passed`);
  console.error('The trading example is the deepest consumer this repository has; a failure here means the packed artifact cannot rebuild it.');
  if (keep) console.error(`Scratch project kept at ${work}`);
  process.exit(1);
}
console.log(`\ntrading dogfood: ${checks.length}/${checks.length} checks passed — the trading example builds from what a stranger would install`);
