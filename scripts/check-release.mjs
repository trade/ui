#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * @trade/ui — release preconditions.
 *
 * The publish itself is a human step with credentials; no script here holds a token or calls
 * `npm publish`. What this does is make the rest of the procedure mechanical instead of remembered:
 * it asserts the state of the world a release requires and stops otherwise. Steps and rationale:
 * docs/release.md.
 *
 * It is deliberately **not** part of `npm run ci`, because half of what it checks is about the moment
 * of cutting — a clean tree, a HEAD that is origin/main, a version that is not already on the registry
 * — none of which is true on a feature branch. Its CI-checkable parts (the two contracts) are covered
 * by `npm run ci` itself, and they are reused here rather than restated.
 *
 * Exit code 0 = the preconditions hold and the publish is a mechanical step.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS } from './expected-counts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['@trade/ui', '@trade/tokens'];

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const run = (bin, args, options) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));

/**
 * npm is invoked through its own CLI entry rather than by spawning `npm`: on Windows there is no `npm`
 * executable, only `npm.cmd`, which Node refuses to spawn without a shell. Same technique as
 * check-pack.mjs and verify-consumer.mjs.
 */
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : 'npm';
const npmArgs = (args) => (npmCli ? [npmCli, ...args] : args);
const npmOptions = (cwd) => ({ cwd, ...(npmCli ? {} : { shell: true }) });

console.log('release preconditions\n');

const ui = read('packages/ui/package.json');
const tokens = read('packages/tokens/package.json');
const version = ui.version;

// 1. the tag points at a commit, so what matters is that the tracked tree has no uncommitted work.
//    Untracked files (a stray log, a local cache) do not change what the tag contains, so they are
//    not a release blocker — asserting on them would fail for reasons the release does not care about.
const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root }).trim();
check('no uncommitted changes to tracked files', dirty === '', dirty ? dirty.split('\n').slice(0, 3).join(' | ') : 'clean');

// 2. cutting from a branch tags something nobody reviewed
let head = '';
let originMain = '';
try {
  head = run('git', ['rev-parse', 'HEAD'], { cwd: root }).trim();
  originMain = run('git', ['rev-parse', 'origin/main'], { cwd: root }).trim();
} catch (error) {
  check('HEAD is origin/main', false, String(error.stderr ?? error.message).split('\n')[0]);
}
if (head || originMain) {
  check(
    'HEAD is origin/main',
    head !== '' && head === originMain,
    head === originMain ? head.slice(0, 9) : `HEAD ${head.slice(0, 9) || 'unknown'} vs origin/main ${originMain.slice(0, 9) || 'unknown'}`
  );
}

// 3. the changelog is the first thing a consumer reads
const changelogPath = resolve(root, 'CHANGELOG.md');
const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
const entry = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm');
check(
  `CHANGELOG.md has a section for ${version}`,
  entry.test(changelog),
  existsSync(changelogPath) ? (entry.test(changelog) ? `"## [${version}]"` : `no "## [${version}]" heading`) : 'CHANGELOG.md is missing'
);

// 4. a private package silently cannot be published
const priv = Object.entries({ '@trade/ui': ui, '@trade/tokens': tokens }).filter(([, m]) => m.private === true).map(([n]) => n);
check('both packages are publishable (not private)', priv.length === 0, priv.length ? `private: ${priv.join(', ')}` : 'neither is private');

// 5 + 6. the two contracts, reused rather than restated. The packaging contract is what makes the
//    tarball the release artifact; the package contract carries the version agreement.
for (const [label, script] of [['the packaging contract passes (check:pack)', 'check-pack.mjs'], ['the package contract passes (check-contract)', 'check-contract.mjs']]) {
  // Report the failing line when there is one: taking the last line of a failed child's output picked a
  // PASS line and printed it beside FAIL, which is the kind of message this repository exists to avoid.
  const pick = (text) => {
    const lines = String(text).trim().split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.find((l) => /\bFAIL\b/.test(l)) ?? lines.slice(-1)[0] ?? '';
  };
  let ok = true;
  let detail = 'reused';
  try {
    detail = pick(run(process.execPath, [resolve(root, 'scripts', script)], { cwd: root })) || 'ok';
  } catch (error) {
    ok = false;
    detail = pick(error.stdout ?? error.stderr ?? error.message) || 'failed';
  }
  check(label, ok, detail.slice(0, 96));
}

// 7. npm rejects republishing a version, after the tag and the changelog have been written
const already = [];
let registryTrouble = '';
for (const name of PACKAGES) {
  try {
    const out = run(npmCommand, npmArgs(['view', `${name}@${version}`, 'version']), npmOptions(root)).trim();
    if (out) already.push(`${name}@${out}`);
  } catch (error) {
    const text = String(error.stderr ?? error.message);
    // 404 is the answer we want: the version does not exist yet.
    if (!/E404|404 Not Found/.test(text)) registryTrouble = `${name}: ${text.split('\n').find((l) => l.trim()) ?? 'unknown error'}`;
  }
}
check(
  `neither package already publishes ${version}`,
  already.length === 0 && registryTrouble === '',
  already.length ? `already published: ${already.join(', ')}` : registryTrouble ? `could not reach the registry — ${registryTrouble}` : `${PACKAGES.length} packages checked`
);

const failed = checks.filter((c) => !c.ok);
if (checks.length !== EXPECTED_COUNTS.release) {
  console.error(`\nrelease: ran ${checks.length} checks, expected-counts.mjs declares ${EXPECTED_COUNTS.release}`);
  process.exit(1);
}
if (failed.length > 0) {
  console.error(`\nrelease: ${checks.length - failed.length}/${checks.length} checks passed`);
  console.error('Fix the preconditions above, not this script. The procedure is documented in docs/release.md.');
  process.exit(1);
}
console.log(`\nrelease: ${checks.length}/${checks.length} checks passed — the publish is now a mechanical step (docs/release.md)`);
