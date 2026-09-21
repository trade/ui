#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

/**
 * @trade/ui — build.
 *   1. bundles src/index.ts to ESM + CJS with react/react-dom external
 *   2. emits .d.ts via tsc
 *   3. concatenates @trade/tokens CSS + component CSS into dist/ui.css
 *      and copies each per-component CSS to dist/components/ (import-level tree-shaking)
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, 'dist');
const stylesDir = resolve(here, 'styles');
const tokensCss = resolve(here, '..', 'tokens', 'dist', 'tokens.css');

mkdirSync(dist, { recursive: true });
mkdirSync(join(dist, 'components'), { recursive: true });

// 1. JS bundles
const shared = {
  entryPoints: [resolve(here, 'src', 'index.ts')],
  bundle: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  jsx: 'automatic',
  target: ['es2020'],
  logLevel: 'info'
};
await build({ ...shared, format: 'esm', outfile: join(dist, 'index.js') });
await build({ ...shared, format: 'cjs', outfile: join(dist, 'index.cjs') });

// 2. declarations
const tsc = spawnSync('npx', ['--no-install', 'tsc', '-p', 'tsconfig.json'], {
  cwd: here,
  stdio: 'inherit',
  shell: true
});
if (tsc.status !== 0) {
  console.error('declaration emit failed');
  process.exit(tsc.status ?? 1);
}

// 3. CSS
if (!existsSync(tokensCss)) {
  console.error('missing @trade/tokens dist/tokens.css — run the tokens build first');
  process.exit(1);
}
const order = ['base.css', 'layout.css', 'button.css', 'forms.css', 'table.css', 'tabs.css', 'feedback.css', 'dialog.css'];
const files = readdirSync(stylesDir).filter((f) => f.endsWith('.css'));
const ordered = [...order.filter((f) => files.includes(f)), ...files.filter((f) => !order.includes(f))];

let combined = '/* @trade/ui — bundled stylesheet (tokens + components). Generated. */\n';
combined += readFileSync(tokensCss, 'utf8') + '\n';
for (const f of ordered) {
  combined += `\n/* --- ${f} --- */\n` + readFileSync(join(stylesDir, f), 'utf8') + '\n';
  copyFileSync(join(stylesDir, f), join(dist, 'components', f));
}
writeFileSync(join(dist, 'ui.css'), combined, 'utf8');

console.log(
  JSON.stringify({ ok: true, files: ['dist/index.js', 'dist/index.cjs', 'dist/ui.css', 'dist/index.d.ts'], cssFiles: ordered.length }, null, 2)
);
