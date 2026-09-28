#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * @trade/ui — consumer contract.
 *
 * Everything else in this repository verifies the library **as a workspace**: the apps import
 * `@trade/ui` through npm's hoisted symlink and copy `packages/ui/dist/ui.css` by filesystem path, and
 * `check-pack.mjs` inspects the tarball's *file list*. None of that can see whether a stranger who runs
 * `npm install @trade/ui` gets a working package — a file present in `dist/` here but absent from the
 * tarball loads perfectly in both apps and in every gate, and breaks only for the first real consumer.
 *
 * So this script stops looking at the repository and becomes a consumer instead:
 *
 *   1. `npm pack` each publishable package for real (no --dry-run) into a scratch directory
 *   2. create a project **outside the repository** and `npm install` the tarballs into it
 *   3. assert the installed copy is a real directory — a symlink would mean the workspace is being
 *      tested again, which is the exact illusion this gate exists to break
 *   4. resolve and import the public entry by name, through the published export map
 *   5. bundle it, so a specifier the export map cannot satisfy fails here
 *   6. render a component to markup under React, and typecheck against the shipped declarations
 *
 * Hermetic: the packages declare zero runtime dependencies (asserted by check-contract.mjs), so the
 * install needs no network, and React — a peer the consumer is expected to provide — is linked in from
 * this repository rather than downloaded.
 *
 * Exit code 0 = the tarball works for someone who did not write it.
 *
 * `--keep` leaves the scratch project behind and prints its path.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, lstatSync, statSync, realpathSync, readdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS } from './counts/consumer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = [
  { dir: 'packages/ui', name: '@trade/ui' },
  { dir: 'packages/tokens', name: '@trade/tokens' }
];

// The surface a consumer is told it can rely on. Not the full export list — an equality check here
// would turn every added component into a gate failure — but the set the docs and the apps use.
const PUBLIC_SURFACE = ['Button', 'DataTable', 'Dialog', 'Menu', 'Popover', 'Select', 'Stack', 'Tabs', 'ThemeProvider', 'Tooltip', 'useTicks'];
// A selector the Button renders and a custom property the tokens define: the cheapest honest proof
// that the CSS that arrived is the library's CSS and not an empty file.
const CSS_SELECTOR = '.ui-btn';
const TOKEN_PROPERTY = '--ui-';

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const run = (bin, args, options) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const read = (file) => readFileSync(file, 'utf8');

/**
 * How to invoke npm. `execFileSync('npm', …)` cannot work on Windows: there is no `npm` executable
 * there, only `npm.cmd`, and Node refuses to spawn a `.cmd` without a shell (EINVAL). This gate is
 * now wired into `npm run ci`, so that defect would make the whole chain unrunnable on a Windows
 * host while Linux CI stayed green. Under `npm run`, npm exports `npm_execpath` — the absolute path
 * of npm-cli.js — so node itself becomes the command and the shell is never needed. Same technique
 * as `check-pack.mjs`; the shell is a fallback only for running this file directly, where
 * `npm_execpath` is absent.
 */
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : 'npm';
const npmArgs = (args) => (npmCli ? [npmCli, ...args] : args);
const npmOptions = (cwd) => ({ cwd, ...(npmCli ? {} : { shell: true }) });

/** Directory links only, so a junction works on Windows without Developer Mode or elevation. */
const linkDir = (from, to) => symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir');
const keep = process.argv.includes('--keep');
const work = mkdtempSync(join(tmpdir(), 'trade-ui-consumer-'));
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

console.log(`consumer contract: installing the published tarballs into ${consumer}\n`);

try {
  // ── 1. the artifacts the tarball is supposed to contain ────────────────────
  // Fail, never skip: a missing build would otherwise make every check below vacuous while the
  // summary still reported a full run.
  const artifacts = {
    'packages/ui': ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/ui.css'],
    'packages/tokens': ['dist/tokens.css', 'dist/tokens.ts']
  };
  const missing = [];
  for (const [dir, files] of Object.entries(artifacts)) {
    for (const file of files) {
      if (!existsSync(resolve(root, dir, file))) missing.push(`${dir}/${file}`);
    }
  }
  check('both publishable packages are built', missing.length === 0, missing.length ? `missing ${missing.join(', ')} — run \`npm run build\`` : `${Object.values(artifacts).flat().length} artifacts`);

  // ── 2. pack for real ──────────────────────────────────────────────────────
  mkdirSync(tarballs, { recursive: true });
  const packed = new Map();
  for (const { dir, name } of PACKAGES) {
    const pkgDir = resolve(root, dir);
    let file;
    try {
      const out = run(npmCommand, npmArgs(['pack', '--json', '--pack-destination', tarballs]), npmOptions(pkgDir));
      const manifest = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1))[0];
      file = join(tarballs, manifest.filename);
    } catch (error) {
      // `prepack` runs here (it copies the licence files in), so a broken lifecycle script surfaces
      // as a pack failure rather than weeks later as a consumer's 404.
      check(`${name}: packs a tarball`, false, String(error.stderr ?? error.message).split('\n').slice(0, 2).join(' '));
      continue;
    }
    packed.set(name, file);
    const size = existsSync(file) ? statSync(file).size : 0;
    check(`${name}: packs a tarball`, size > 0, size ? `${file.split('/').pop()} (${size} bytes)` : 'no tarball written');
  }

  // ── 3. install into a project outside the repository ──────────────────────
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer-probe', private: true, version: '0.0.0', type: 'module' }, null, 2) + '\n');
  // --offline: the packages have no runtime dependencies, so a correct install needs no registry.
  // --omit=peer: React arrives below, the way a consumer's own project would provide it.
  // --legacy-peer-deps: without it, npm still resolves peer ranges to build the tree — it does not
  // install react, but it fetches react's packument first, so on a clean machine (empty npm cache)
  // the install died with ENOTCACHED: "cache mode is 'only-if-cached' but no cached response is
  // available". That only passed on the machine this was written on because its cache was warm.
  // Ignoring peers bypasses the lookup, which keeps the gate genuinely offline instead of
  // accidentally so.
  let installError = null;
  try {
    run(
      npmCommand,
      npmArgs(['install', ...packed.values(), '--omit=peer', '--legacy-peer-deps', '--no-audit', '--no-fund', '--ignore-scripts', '--offline']),
      npmOptions(consumer)
    );
  } catch (error) {
    installError = error;
  }
  const installed = [...packed.keys()].map((name) => ({ name, path: join(consumer, 'node_modules', name) }));
  check(
    'the tarballs install into a project outside the repository',
    !installError && installed.every(({ path }) => existsSync(path)),
    installError ? String(installError.stderr ?? installError.message).split('\n').slice(0, 3).join(' ') : `${installed.length} packages in ${consumer}`
  );

  // The discriminator. npm symlinks workspace packages; if that is what landed here, every assertion
  // below would be measuring `packages/ui` in the working tree and the gate would be a second
  // check-pack wearing a disguise.
  const symlinked = installed.filter(({ path }) => existsSync(path) && lstatSync(path).isSymbolicLink()).map(({ name }) => name);
  check(
    'the installed copies are real directories, not workspace links',
    installed.every(({ path }) => existsSync(path)) && symlinked.length === 0,
    symlinked.length ? `symlinked: ${symlinked.join(', ')} — the workspace is being tested, not the tarball` : 'published contents, not a link'
  );

  // The install must pull in nothing but these two packages. `check-contract` asserts the manifests
  // declare no runtime dependencies; this measures the same claim on what npm actually reified —
  // and it is what keeps the `--offline` above honest rather than a statement about the author's
  // cache. Both must be present, so the check can only be satisfied by the dependency being real.
  const added = existsSync(join(consumer, 'node_modules'))
    ? readdirSync(join(consumer, 'node_modules')).filter((name) => !name.startsWith('.'))
    : [];
  check(
    'the install pulls in nothing but the two packages',
    added.length === 1 && added[0] === '@trade',
    `node_modules holds ${added.join(', ') || 'nothing'}`
  );

  // The peer the consumer provides. Linked rather than downloaded so the gate stays offline.
  const peerLinks = ['react', 'react-dom', 'scheduler'];
  const typeLinks = ['@types/react', '@types/react-dom'];
  for (const name of peerLinks) {
    const from = join(root, 'node_modules', name);
    if (existsSync(from)) linkDir(from, join(consumer, 'node_modules', name));
  }
  for (const name of typeLinks) {
    const from = join(root, 'node_modules', name);
    if (!existsSync(from)) continue;
    mkdirSync(join(consumer, 'node_modules', '@types'), { recursive: true });
    linkDir(from, join(consumer, 'node_modules', name));
  }

  // ── 4. import it by name, from inside the consumer ────────────────────────
  // A separate file, run with the consumer as cwd, so bare specifiers resolve against the consumer's
  // node_modules and not against this repository's.
  writeFileSync(
    join(consumer, 'use.mjs'),
    `import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const facts = {};
try {
  facts.esmExports = Object.keys(await import('@trade/ui')).sort();
} catch (error) { facts.esmError = String(error.message); }
// Each specifier resolves in its own try, so a failure names the module that actually failed
// rather than the first one the probe happened to reach.
try { facts.cjsEntry = require.resolve('@trade/ui'); } catch (error) { facts.cjsError = String(error.message); }
// resolve() only finds the file. Loading it is what a CommonJS consumer does, and an index.cjs that
// throws on load would otherwise pass every check here.
try { facts.cjsExports = Object.keys(require('@trade/ui')).sort(); } catch (error) { facts.cjsError = String(error.message); }
try {
  facts.css = require.resolve('@trade/ui/styles.css');
  facts.cssBytes = statSync(facts.css).size;
  facts.cssSource = readFileSync(facts.css, 'utf8').slice(0, 400000);
} catch (error) { facts.cssError = String(error.message); }
try {
  facts.tokensCss = require.resolve('@trade/tokens/tokens.css');
  facts.tokensCssSource = readFileSync(facts.tokensCss, 'utf8').slice(0, 400000);
} catch (error) { facts.tokensError = String(error.message); }
// The package's other structural export: the per-component stylesheets under ./components/*, which a
// consumer imports to ship only what it uses.
try {
  facts.componentCss = require.resolve('@trade/ui/components/button.css');
  facts.componentCssSource = readFileSync(facts.componentCss, 'utf8').slice(0, 40000);
} catch (error) { facts.componentCssError = String(error.message); }
try {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Button } = await import('@trade/ui');
  facts.markup = renderToStaticMarkup(createElement(Button, null, 'Save'));
} catch (error) { facts.renderError = String(error.message); }
console.log('FACTS ' + JSON.stringify(facts));
`
  );
  let facts = {};
  let probeError = null;
  try {
    const out = run(process.execPath, ['use.mjs'], { cwd: consumer });
    const line = out.split('\n').find((l) => l.startsWith('FACTS '));
    if (!line) throw new Error(`probe printed no facts:\n${out.slice(0, 400)}`);
    facts = JSON.parse(line.slice('FACTS '.length));
  } catch (error) {
    probeError = error;
  }

  // Compare realpaths: on macOS the system temp directory is reached through a symlink, so Node hands
  // back /private/var/... while this script holds /var/.... A string prefix test would call a perfectly
  // good install "outside the consumer" — it did, on the first run of this gate.
  const consumerModules = realpathSync(join(consumer, 'node_modules'));
  const insideConsumer = (file) => {
    if (typeof file !== 'string') return false;
    try {
      return realpathSync(file).startsWith(consumerModules + sep);
    } catch {
      return false;
    }
  };
  const probeFailure = probeError ? String(probeError.stderr || probeError.message).split('\n').slice(0, 3).join(' ') : null;

  check(
    '@trade/ui resolves and imports by name from the installed copy',
    !probeError && !facts.esmError && !facts.cjsError && insideConsumer(facts.cjsEntry) && facts.cjsEntry.endsWith('index.cjs'),
    probeFailure ?? facts.esmError ?? facts.cjsError ?? facts.cjsEntry
  );

  const absent = PUBLIC_SURFACE.filter((name) => !(facts.esmExports ?? []).includes(name));
  check(
    'the installed entry exposes the documented public surface',
    Array.isArray(facts.esmExports) && absent.length === 0,
    facts.esmError ?? (absent.length ? `missing ${absent.join(', ')}` : `${facts.esmExports?.length ?? 0} exports`)
  );

  const cjsAbsent = PUBLIC_SURFACE.filter((name) => !(facts.cjsExports ?? []).includes(name));
  check(
    'CommonJS loads and exports the same surface',
    Array.isArray(facts.cjsExports) && cjsAbsent.length === 0,
    facts.cjsError ?? (cjsAbsent.length ? `missing ${cjsAbsent.join(', ')}` : `${facts.cjsExports?.length ?? 0} exports`)
  );

  check(
    '@trade/ui/styles.css resolves through the export map',
    insideConsumer(facts.css) && existsSync(facts.css),
    probeFailure ?? facts.cssError ?? facts.css ?? 'not resolved'
  );

  const cssOk = (facts.cssBytes ?? 0) > 1000 && String(facts.cssSource ?? '').includes(CSS_SELECTOR);
  check(
    'the resolved stylesheet carries the component styles',
    cssOk,
    cssOk ? `${facts.cssBytes} bytes, contains ${CSS_SELECTOR}` : facts.cssError ?? `${facts.cssBytes ?? 0} bytes, ${CSS_SELECTOR} absent`
  );

  const tokensOk = insideConsumer(facts.tokensCss) && String(facts.tokensCssSource ?? '').includes(TOKEN_PROPERTY);
  check(
    '@trade/tokens/tokens.css resolves from the installed copy',
    tokensOk,
    tokensOk ? `${facts.tokensCss.split(sep).pop()}, contains ${TOKEN_PROPERTY}` : facts.tokensError ?? String(facts.tokensCss ?? 'not resolved')
  );

  // The last structural export. `check:pack` compares the packed per-component stylesheet count
  // against the source set, but nothing resolved one the way a consumer does until this.
  const componentCssOk = insideConsumer(facts.componentCss) && String(facts.componentCssSource ?? '').includes(CSS_SELECTOR);
  check(
    'a per-component stylesheet resolves through the export map',
    componentCssOk,
    componentCssOk ? `${facts.componentCss.split(sep).pop()}, contains ${CSS_SELECTOR}` : facts.componentCssError ?? String(facts.componentCss ?? 'not resolved')
  );

  // ── 5. a bundler, not just Node ───────────────────────────────────────────
  // Node's resolver and a bundler's do not agree on everything, and consumers use a bundler.
  writeFileSync(
    join(consumer, 'entry.jsx'),
    `import { Button } from '@trade/ui';
import '@trade/ui/styles.css';

export const Element = () => <Button>Save</Button>;
`
  );
  const outDir = join(consumer, 'out');
  let bundleError = null;
  let metafile = null;
  try {
    const esbuild = await import('esbuild');
    const result = await esbuild.build({
      entryPoints: [join(consumer, 'entry.jsx')],
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      platform: 'browser',
      outdir: outDir,
      absWorkingDir: consumer,
      logLevel: 'silent',
      metafile: true
    });
    metafile = result.metafile;
  } catch (error) {
    bundleError = error;
  }
  const js = existsSync(join(outDir, 'entry.js')) ? read(join(outDir, 'entry.js')) : '';
  const bundledCss = existsSync(join(outDir, 'entry.css')) ? read(join(outDir, 'entry.css')) : '';
  // The library must be *in* the bundle: an unresolved bare import would be reported as an external
  // dependency and shipped to the browser as a runtime error.
  const output = metafile ? Object.values(metafile.outputs).find((o) => o.entryPoint) : null;
  const externals = (output?.imports ?? []).filter((i) => i.external && i.path.startsWith('@trade/')).map((i) => i.path);
  check(
    'a bundler resolves the package and the stylesheet',
    !bundleError && js.includes('ui-btn') && bundledCss.includes(CSS_SELECTOR) && externals.length === 0,
    bundleError ? String(bundleError.message).split('\n').slice(0, 2).join(' ') : `${js.length} bytes js, ${bundledCss.length} bytes css${externals.length ? `, left external: ${externals.join(', ')}` : ''}`
  );

  // ── 6. it actually renders ────────────────────────────────────────────────
  const markupOk = typeof facts.markup === 'string' && facts.markup.includes('<button') && facts.markup.includes('ui-btn') && facts.markup.includes('Save');
  check(
    'a component renders to markup under React',
    markupOk,
    facts.renderError ? facts.renderError : markupOk ? facts.markup.slice(0, 90) : `unexpected markup: ${String(facts.markup).slice(0, 90)}`
  );

  // ── 7. the types travel too ───────────────────────────────────────────────
  // The declarations are part of the promise, and tsc is run against the *installed* package here,
  // not against the source the way `npm run check:types` does.
  // Node runs TypeScript's own JS entry rather than the .bin shim: on Windows that shim is `tsc.cmd`,
  // and Node cannot spawn a .cmd without a shell (EINVAL) -- the same defect that made check:pack
  // unrunnable there. `typescript/bin/tsc` is a .js file, so this works on every platform.
  const tscEntry = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(tscEntry)) {
    check('typescript compiles against the installed declarations', false, 'typescript is not installed in node_modules');
  } else {
    // Several exports, not just one: a declaration dropped for anything a consumer imports must fail
    // here, and referencing each in a type position needs no knowledge of its prop shape.
    writeFileSync(
      join(consumer, 'use.tsx'),
      `import { Button, DataTable, Dialog, Menu, Popover, Select, Tabs, ThemeProvider, Tooltip, useTicks } from '@trade/ui';

export type Surface = [
  typeof Button, typeof DataTable, typeof Dialog, typeof Menu, typeof Popover,
  typeof Select, typeof Tabs, typeof ThemeProvider, typeof Tooltip, typeof useTicks
];

export const element = <Button>Save</Button>;
`
    );
    writeFileSync(
      join(consumer, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            strict: true,
            noEmit: true,
            jsx: 'react-jsx',
            module: 'esnext',
            moduleResolution: 'bundler',
            target: 'es2020',
            skipLibCheck: true,
            types: []
          },
          include: ['use.tsx']
        },
        null,
        2
      ) + '\n'
    );
    let tscError = null;
    try {
      run(process.execPath, [tscEntry, '-p', join(consumer, 'tsconfig.json')], { cwd: consumer });
    } catch (error) {
      tscError = error;
    }
    check(
      'typescript compiles against the installed declarations',
      !tscError,
      tscError ? String(tscError.stdout ?? tscError.message).split('\n').filter(Boolean).slice(0, 2).join(' ') : 'tsc --strict resolves @trade/ui and react-jsx'
    );
  }
} finally {
  cleanup();
}

const failed = checks.filter((c) => !c.ok);
if (checks.length !== EXPECTED_COUNTS.consumer) {
  console.error(`consumer contract: ran ${checks.length} checks, scripts/counts/consumer.mjs declares ${EXPECTED_COUNTS.consumer}`);
  process.exit(1);
}
if (failed.length > 0) {
  console.error(`\nconsumer contract: ${checks.length - failed.length}/${checks.length} checks passed`);
  console.error('The tarball is what a consumer receives: a failure here means they cannot install, resolve or use it.');
  if (keep) console.error(`Scratch project kept at ${work}`);
  process.exit(1);
}
console.log(`\nconsumer contract: ${checks.length}/${checks.length} checks passed — the tarball works for someone who did not write it`);
