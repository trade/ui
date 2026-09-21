#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>
/**
 * @trade/ui — run the browser suite inside the same container image CI uses.
 *
 * The browser suite needs Chromium, Firefox and WebKit plus their system libraries. Playwright
 * supports macOS 14 and later only, so a host below that floor cannot run the suite at all; and a
 * host that *can* run it still renders differently from the Linux container that produced
 * `baselines/linux`. Running inside the pinned image removes both problems: the generation
 * environment equals the comparison environment by construction (ADR-005).
 *
 * The image reference is read from `.github/workflows/ci.yml`, so the local route and CI can never
 * drift apart. `node_modules` lives in a named volume, so the host checkout is never written to.
 *
 * Usage:
 *   node scripts/verify-browser-docker.mjs
 *   node scripts/verify-browser-docker.mjs --update-baselines
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const update = process.argv.includes('--update-baselines');

// The image is whatever CI pins — read it, never restate it (parity by construction).
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const image = workflow.match(/image:\s*(mcr\.microsoft\.com\/playwright:\S+)/)?.[1];
if (!image) {
  console.error('verify:browser:docker — could not find the pinned Playwright image in .github/workflows/ci.yml');
  process.exit(1);
}

try {
  execFileSync('docker', ['info'], { stdio: 'ignore' });
} catch {
  console.error(
    'verify:browser:docker — Docker is not reachable.\n'
      + '  Start Docker Desktop (or `podman machine start`) and retry.\n'
      + '  On hosts below Playwright\'s macOS floor this is the only way to run the browser suite.'
  );
  process.exit(1);
}

console.log(`image : ${image}`);
console.log(`mode  : ${update ? 'baselines:update' : 'verify:browser'}`);
console.log('        (node_modules lives in the named volume `ui-node-modules`; the host tree is untouched)');

// Mirrors the CI `verify`/`baselines` job: same image, same --shm-size (Firefox), same HOME.
const steps = [
  'npm ci --no-audit --no-fund',
  'npm run build',
  'npm run harness:build',
  update ? 'npm run baselines:update' : 'npm run verify:browser'
];

try {
  execFileSync(
    'docker',
    [
      'run', '--rm',
      '--shm-size=1g',
      '-v', `${root}:/work`,
      '-v', 'ui-node-modules:/work/node_modules',
      '-w', '/work',
      '-e', 'HOME=/tmp',
      image,
      'bash', '-lc', steps.join(' && ')
    ],
    { stdio: 'inherit' }
  );
} catch (error) {
  console.error(`verify:browser:docker — suite failed (exit ${error.status ?? 'unknown'})`);
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
