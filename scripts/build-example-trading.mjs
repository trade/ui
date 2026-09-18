#!/usr/bin/env node
/** Build the trading example: bundle the app (IIFE) and copy both stylesheets. */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const app = resolve(root, 'apps', 'example-trading');
const out = resolve(app, 'dist');
mkdirSync(out, { recursive: true });

const uiCss = resolve(root, 'packages', 'ui', 'dist', 'ui.css');
if (!existsSync(uiCss)) {
  console.error('missing packages/ui/dist/ui.css — run `npm run build` first');
  process.exit(1);
}
copyFileSync(uiCss, resolve(out, 'ui.css'));
copyFileSync(resolve(app, 'src', 'screen.css'), resolve(out, 'screen.css'));
copyFileSync(resolve(app, 'src', 'index.html'), resolve(out, 'index.html'));

await build({
  entryPoints: [resolve(app, 'src', 'main.jsx')],
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
console.log(
  JSON.stringify(
    {
      ok: true,
      entry: resolve(out, 'index.html'),
      references: ['ui.css', 'screen.css', 'app.js'].filter((f) => html.includes(f)),
      appBytes: readFileSync(resolve(out, 'app.js')).length
    },
    null,
    2
  )
);
