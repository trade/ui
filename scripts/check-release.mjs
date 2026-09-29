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
import { EXPECTED_COUNTS } from './counts/release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['@trade/ui', '@trade/tokens'];

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const run = (bin, args, options) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
// Every RegExp metacharacter, not just the dot a version happens to contain.
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
const manifests = { '@trade/ui': ui, '@trade/tokens': tokens };
const version = ui.version;

// 1. the tag points at a commit, so uncommitted work is work that does not ship. Untracked files are
//    the subtler half: npm packs files that sit *inside* a package directory whether or not git knows
//    about them, so a stray README in packages/ui would be published without ever being reviewed. A
//    scratch file elsewhere in the tree is not a release blocker, so only the packages are checked.
const dirty = run('git', ['status', '--porcelain'], { cwd: root }).trim();
const tracked = dirty.split('\n').filter((l) => l && !l.startsWith('??'));
const strayInPackages = dirty.split('\n').filter((l) => l.startsWith('??') && /packages\/(ui|tokens)\//.test(l));
check(
  'no uncommitted changes, and no untracked files inside the packages',
  tracked.length === 0 && strayInPackages.length === 0,
  tracked.length || strayInPackages.length
    ? [...tracked.slice(0, 3), ...strayInPackages.slice(0, 3).map((l) => `untracked ${l.replace(/^\?\? /, '')}`)].join(' | ')
    : 'clean'
);

// 2. cut from main, not from a branch, and not from behind the remote.
//    This deliberately does *not* require HEAD to equal origin/main: that would force the push to happen
//    before the gate, so a failing gate would leave the release version on main with no way back but
//    another commit. The gate runs before the push instead.
let branch = '';
let ahead = '';
let behind = '';
try {
  branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).trim();
  // --left-right counts the first operand's side first: with `HEAD...origin/main`, column 0 is how
  // far HEAD is ahead of origin/main, column 1 is how far it is behind. Reading them the other way
  // round rejected the very state this gate exists for — main with the bump commit unpushed.
  const counts = run('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main'], { cwd: root }).trim().split(/\s+/);
  ahead = counts[0];
  behind = counts[1];
} catch (error) {
  check('the release is cut from main', false, String(error.stderr ?? error.message).split('\n')[0]);
}
if (branch || ahead) {
  check(
    'the release is cut from main',
    (branch === 'main' || branch === 'master') && behind === '0',
    branch === '' ? 'could not read the branch' : `${branch}, ${ahead} ahead / ${behind} behind origin/main`
  );
}

// 3. the changelog is the first thing a consumer reads
const changelogPath = resolve(root, 'CHANGELOG.md');
const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
const entry = new RegExp(`^## \\[${escapeRe(version)}\\]`, 'm');
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
  let detail;
  try {
    detail = pick(run(process.execPath, [resolve(root, 'scripts', script)], { cwd: root })) || 'ok';
  } catch (error) {
    ok = false;
    detail = pick(error.stdout ?? error.stderr ?? error.message) || 'failed';
  }
  check(label, ok, detail.slice(0, 96));
}

// 7. npm rejects republishing a version, after the tag and the changelog have been written.
//    Probe the registry each package will actually publish to (publishConfig.registry — GitHub
//    Packages in this repository), not npm's default: the gate must ask the same server
//    `npm publish` will. GitHub Packages answers unauthenticated lookups with the same 404 it
//    returns for packages that do not exist, so without credentials a 404 cannot be trusted —
//    the release procedure logs in first (docs/release.md) and this check fails closed without one.
const already = [];
const registryTroubles = [];
const pushTrouble = (message) => { if (!registryTroubles.includes(message)) registryTroubles.push(message); };
for (const name of PACKAGES) {
  const registry = manifests[name].publishConfig?.registry ?? '';
  if (registry.includes('npm.pkg.github.com')) {
    try {
      run(npmCommand, npmArgs(['whoami', '--registry', registry]), npmOptions(root));
    } catch (error) {
      const text = String(error.stderr ?? error.message);
      pushTrouble(/ENEEDAUTH|E401|E403|need auth|logged in|unauthor/i.test(text)
        ? `not logged in to ${registry} — unauthenticated lookups return the same 404 as "not found": npm login --scope=@trade --auth-type=legacy --registry=${registry}`
        : `${name}: ${text.split('\n').find((l) => l.trim()) ?? 'unknown error'}`);
      continue;
    }
  }
  const args = ['view', `${name}@${version}`, 'version', ...(registry ? ['--registry', registry] : [])];
  try {
    const out = run(npmCommand, npmArgs(args), npmOptions(root)).trim();
    if (out) already.push(`${name}@${out}`);
  } catch (error) {
    const text = String(error.stderr ?? error.message);
    // 404 is the answer we want: the version does not exist yet.
    if (!/E404|404 Not Found/.test(text)) pushTrouble(`${name}: ${text.split('\n').find((l) => l.trim()) ?? 'unknown error'}`);
  }
}
check(
  `neither package already publishes ${version}`,
  already.length === 0 && registryTroubles.length === 0,
  already.length ? `already published: ${already.join(', ')}` : registryTroubles.length ? `could not verify the registry — ${registryTroubles.join(' · ')}` : `${PACKAGES.length} packages checked`
);

const failed = checks.filter((c) => !c.ok);
if (checks.length !== EXPECTED_COUNTS.release) {
  console.error(`\nrelease: ran ${checks.length} checks, scripts/counts/release.mjs declares ${EXPECTED_COUNTS.release}`);
  process.exit(1);
}
if (failed.length > 0) {
  console.error(`\nrelease: ${checks.length - failed.length}/${checks.length} checks passed`);
  console.error('Fix the preconditions above, not this script. The procedure is documented in docs/release.md.');
  process.exit(1);
}
console.log(`\nrelease: ${checks.length}/${checks.length} checks passed — the publish is now a mechanical step (docs/release.md)`);
