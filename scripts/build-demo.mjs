#!/usr/bin/env node
/** Build the static demo: bundle the app (IIFE so it opens from file://) and copy the stylesheet. */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const demo = resolve(root, 'apps', 'demo');
const out = resolve(demo, 'dist');
mkdirSync(out, { recursive: true });

const css = resolve(root, 'packages', 'ui', 'dist', 'ui.css');
if (!existsSync(css)) {
  console.error('missing packages/ui/dist/ui.css — run `npm run build` first');
  process.exit(1);
}
copyFileSync(css, resolve(out, 'ui.css'));
copyFileSync(resolve(demo, 'src', 'app.css'), resolve(out, 'app.css'));
copyFileSync(resolve(demo, 'src', 'index.html'), resolve(out, 'index.html'));

await build({
  entryPoints: [resolve(demo, 'src', 'main.jsx')],
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
