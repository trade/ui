#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

/** Build the component example app: bundle it (IIFE so it opens from file://) and copy the stylesheets. */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const appDir = resolve(root, 'apps', 'example');
const out = resolve(appDir, 'dist');
mkdirSync(out, { recursive: true });

// Consume the entry the package publishes (`@trade/ui/styles.css`) instead of reaching into
// packages/ui/dist/ by path: the path is an implementation detail, and resolving the exported subpath
// is what a consumer does. `scripts/verify-consumer.mjs` proves a stranger can do the same from the
// packed tarball.
const require = createRequire(join(appDir, 'package.json'));
let css;
try {
  css = require.resolve('@trade/ui/styles.css');
} catch {
  console.error('missing @trade/ui/styles.css — run `npm run build` first');
  process.exit(1);
}
copyFileSync(css, resolve(out, 'ui.css'));
copyFileSync(resolve(appDir, 'src', 'app.css'), resolve(out, 'app.css'));
copyFileSync(resolve(appDir, 'src', 'index.html'), resolve(out, 'index.html'));

await build({
  entryPoints: [resolve(appDir, 'src', 'main.jsx')],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  target: ['es2020'],
  minify: true,
  outfile: resolve(out, 'app.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning'
});

const html = readFileSync(resolve(out, 'index.html'), 'utf8');
const app = readFileSync(resolve(out, 'app.js'));
console.log(
  JSON.stringify(
    {
      ok: true,
      entry: resolve(out, 'index.html'),
      referencesStyles: html.includes('./ui.css'),
      referencesScript: html.includes('./app.js'),
      appBytes: app.length,
      cssBytes: readFileSync(resolve(out, 'ui.css')).length
    },
    null,
    2
  )
);
