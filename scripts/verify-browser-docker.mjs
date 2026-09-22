#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
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
 * drift apart. The verify job and the baselines job must pin the *same* image — generation
 * environment equals comparison environment is the whole point — and this refuses to run if they
 * ever diverge.
 *
 * The container runs as the invoking user (not root) so files written into the mounted checkout
 * stay owned by the developer; the node_modules volume is chowned to that user first.
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
const VOLUME = 'ui-node-modules';

// ---- the image is whatever CI pins: read it, never restate it (parity by construction) ----
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const pins = [...new Set(workflow.match(/mcr\.microsoft\.com\/playwright:\S+@sha256:[a-f0-9]{64}/g) ?? [])];
if (pins.length === 0) {
  console.error('verify:browser:docker — no digest-pinned Playwright image found in .github/workflows/ci.yml');
  process.exit(1);
}
if (pins.length > 1) {
  console.error(
    'verify:browser:docker — the CI jobs pin more than one Playwright image:\n'
      + pins.map((p) => `    ${p}`).join('\n')
      + '\n  The generation environment must equal the comparison environment (ADR-005), so this'
      + '\n  refuses to guess. Align the pins, then re-run.'
  );
  process.exit(1);
}
const image = pins[0];

// ---- docker reachable? ----
try {
  execFileSync('docker', ['info'], { stdio: 'ignore' });
} catch {
  console.error(
    'verify:browser:docker — Docker is not reachable.\n'
      + '  Start Docker Desktop (or `podman machine start`) and retry.\n'
      + "  On hosts below Playwright's macOS floor this is the only way to run the browser suite."
  );
  process.exit(1);
}

// ---- run as the invoking user so the mounted checkout is never left root-owned ----
const uid = process.getuid?.();
const gid = process.getgid?.();
const user = uid === undefined ? [] : ['--user', `${uid}:${gid}`];

if (user.length) {
  // A named volume is created root-owned; hand it to the developer before npm ci writes into it.
  // `chown -R` on an empty or already-correct volume is a no-op, so this is safe to repeat.
  try {
    execFileSync(
      'docker',
      ['run', '--rm', '-v', `${VOLUME}:/work`, image, 'chown', '-R', `${uid}:${gid}`, '/work'],
      { stdio: 'ignore' }
    );
  } catch {
    console.error(
      `verify:browser:docker — could not take ownership of the \`${VOLUME}\` volume.\n`
        + `  If an earlier root run created it, remove it and retry:  docker volume rm ${VOLUME}`
    );
    process.exit(1);
  }
}

console.log(`image : ${image}`);
console.log(`mode  : ${update ? 'baselines:update' : 'verify:browser'}`);
console.log(`user  : ${user.length ? `${uid}:${gid} (host)` : 'image default'}`);
console.log(`        node_modules lives in the volume \`${VOLUME}\`; build output is written to the mounted checkout`);

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
      ...user,
      '--shm-size=1g',
      '-v', `${root}:/work`,
      '-v', `${VOLUME}:/work/node_modules`,
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
