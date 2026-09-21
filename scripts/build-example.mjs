#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

/** Build the component example app: bundle it (IIFE so it opens from file://) and copy the stylesheets. */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const appDir = resolve(root, 'apps', 'example');
const out = resolve(appDir, 'dist');
mkdirSync(out, { recursive: true });

const css = resolve(root, 'packages', 'ui', 'dist', 'ui.css');
if (!existsSync(css)) {
  console.error('missing packages/ui/dist/ui.css — run `npm run build` first');
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
