// SPDX-License-Identifier: MIT OR Apache-2.0

// Docs integrity gates: (1) every relative Markdown link in docs/** must resolve to an
// existing file; (2) GitHub alert callouts must be one of the five exact types, uppercase,
// on the first line of a blockquote (CONTRIBUTING.md § 9). Exit 1 on any violation.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS } from './expected-counts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');

const ALERT = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/;

const markdownFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.md')) markdownFiles.push(full);
  }
}
walk(docsDir);
for (const f of readdirSync(root)) {
  if (f.endsWith('.md')) markdownFiles.push(join(root, f));
}
// .github/**/*.md is repository-facing (the PR template and issue forms) and had drifted unnoticed
// because discovery only walked docs/ plus root-level files - a dangling link there passed the gate
// while the identical link in README failed it (Greptile P2 on #33).
const githubDir = join(root, '.github');
if (existsSync(githubDir)) walk(githubDir);

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const ALERT_USE = /^\s*>\s*\[!([A-Za-z-]+)\]/;
let links = 0;
let callouts = 0;
const broken = [];
const badCallouts = [];

for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8');
  const display = relative(root, file);
  // strip fenced code blocks so examples of links/callouts aren't checked
  const prose = source.replace(/```[\s\S]*?```/g, '');
  for (const [, target] of prose.matchAll(LINK)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    links += 1;
    const resolved = resolve(dirname(file), decodeURIComponent(target.split('#')[0]));
    if (!existsSync(resolved)) broken.push(`${display} -> ${target}`);
  }
  for (const line of prose.split('\n')) {
    const m = line.match(ALERT_USE);
    if (!m) continue;
    callouts += 1;
    if (!ALERT.test(line.trim())) badCallouts.push(`${display}: ${line.trim()}`);
  }
}

console.log(`docs links: ${links - broken.length}/${links} resolve (${markdownFiles.length} files)`);
console.log(`docs callouts: ${callouts - badCallouts.length}/${callouts} valid alert syntax`);
if (broken.length > 0) {
  for (const line of broken) console.error(`  dangling: ${line}`);
}
if (badCallouts.length > 0) {
  for (const line of badCallouts) console.error(`  bad callout: ${line}`);
}
if (broken.length > 0 || badCallouts.length > 0) process.exit(1);

// ── documented numbers and policy statements ─────────────────────────────────
// The suite's totals are the single source of truth (CHECKS_PER_COMBO in
// scripts/browser-suite.mjs, asserted against the real run). Documentation that
// quotes different numbers rots contributor expectations — this repo hit exactly
// that (72 vs 84) twice in review. Exit 1 on any drift.
import { execSync } from 'node:child_process';

const counts = execSync('node scripts/browser-suite.mjs --print-counts', { cwd: root, encoding: 'utf8' });
const [, compareStr, updateStr] = counts.match(/compare=(\d+) update=(\d+)/) ?? [];
const compare = Number(compareStr);
const update = Number(updateStr);
if (!Number.isInteger(compare) || !Number.isInteger(update)) {
  console.error('docs counts: could not read CHECKS_PER_COMBO from browser-suite.mjs --print-counts');
  process.exit(1);
}

const readDoc = (name) => readFileSync(join(root, name), 'utf8');
const readme = readDoc('README.md');
const agents = readDoc('AGENTS.md');
const contributing = readDoc('CONTRIBUTING.md');

const stale = [];
const expectIn = (doc, docName, pattern, what) => {
  if (!pattern.test(doc)) stale.push(`${docName}: missing ${what}`);
};
const forbidIn = (doc, docName, pattern, what) => {
  if (pattern.test(doc)) stale.push(`${docName}: still contains ${what}`);
};

// The known historical drift: AGENTS.md said 72 while the suite produced 84.
// Only the browser-suite total is machine-verified here (it is the one count a suite prints);
// the verify/check:style/check:contract counts were fixed by hand, which is exactly how they had
// drifted — the staleTokens scan below is the backstop for the ones that did.
expectIn(readme, 'README.md', new RegExp(`verify:browser\\s*#\\s*${compare} checks`), `the verify:browser row total (${compare} checks)`);
expectIn(readme, 'README.md', new RegExp(`${compare}/${compare}`), `the clean-run total (${compare}/${compare})`);
expectIn(agents, 'AGENTS.md', new RegExp(`browser-suite\\.mjs\\s+${compare} checks`), 'the repository-map browser-suite count');
expectIn(agents, 'AGENTS.md', /baselines\/<platform>/, 'the baselines reviewed-exception (baselines/<platform>/)');

// Stale paths and script names. The apps are examples (apps/example,
// apps/example-trading); docs pointing at the pre-restructure names send
// contributors (and agents) into files that no longer exist.
// Scan EVERY markdown file, not a hand-listed four: docs/ and .github/ carried pre-restructure
// names (apps/demo, verify-demo) for weeks because this list only covered README/AGENTS/
// CONTRIBUTING/STATUS. Suite-printed numbers are governed below; names and figures no suite
// prints depend on this list staying honest.
const staleTokens = [
  'apps/demo', 'apps/trading', 'verify:demo', 'verify:screen', 'screen:build',
  'npm run demo', 'build-demo', 'verify-demo', 'build-trading',
  '39 library checks', '97 checks over', '12 checks × 6 combos = 72',
  '4.34', '4.06 kB', '4.2 KB gzip',
  // Superseded size figures. They lived in four documents and drifted apart; the current values are
  // gated by scripts/check-size-claims.mjs, and these must never come back.
  '5.89', '620 B', '6.36 kB', '3.72 kB', '7.78 kB', '5.47 kB',
  '21 roles', '114 custom properties', '8 files, ~320', '26 checks: virtualization',
  '20 steps'
];
for (const file of markdownFiles) {
  const doc = readFileSync(file, 'utf8');
  const docName = relative(root, file);
  for (const token of staleTokens) {
    if (doc.includes(token)) stale.push(`${docName}: stale reference "${token}"`);
  }
}
expectIn(contributing, 'CONTRIBUTING.md', /baselines\/<platform>/, 'the baselines reviewed-exception (baselines/<platform>/)');
expectIn(readme, 'README.md', /baselines\/<platform>/, 'the baselines reviewed-exception (baselines/<platform>/)');

// The perf-retry policy is a gate, so it must be described where the retry is documented and
// wired into the chain that runs it (Rule zero: a rule without a gate rots).
const verification = readDoc('docs/verification.md');
const performanceDoc = readDoc('docs/performance.md');
const pkg = readDoc('package.json');
expectIn(verification, 'docs/verification.md', new RegExp('browser-suite\\.mjs[^\\n]*= ' + compare), 'the browser-suite per-combo total (= ' + compare + ')');
expectIn(verification, 'docs/verification.md', /perf-policy\.mjs/, 'the perf-policy module');
// The consumer gate is described where the other suites are; a gate nobody documents is a gate the
// next contributor deletes. Rule zero applies to the doc as much as to the chain.
expectIn(verification, 'docs/verification.md', /verify-consumer\.mjs/, 'the consumer gate section');
expectIn(verification, 'docs/verification.md', /verify-consumer-trading\.mjs/, 'the trading dogfood section');
expectIn(performanceDoc, 'docs/performance.md', /perf-policy\.mjs/, 'the perf-policy module');
expectIn(pkg, 'package.json', /"check:perf-policy":/, 'the check:perf-policy script');
expectIn(pkg, 'package.json', /check:perf-policy && npm run check:commits/, 'check:perf-policy wired into the ci chain');
const workflow = readDoc('.github/workflows/ci.yml');
expectIn(workflow, '.github/workflows/ci.yml', /npm run check:perf-policy/, 'the perf-policy gate in the CI build job');
// Rule zero for a workflow: the npm chain is not what CI runs. GitHub Actions runs these steps
// individually, so a gate that is only added to `npm run ci` never executes on a pull request — which
// is exactly what happened to the consumer gate before this assertion existed.
// The consumer-family gates must appear as STEPS in both jobs that exercise platform-sensitive
// behavior, and as complete commands: `verify:consumer` is a prefix of `verify:consumer:trading`,
// so a substring match can be satisfied by the wrong gate, and a whole-file search cannot see a
// step removed from just one of the two jobs (#94 review).
const jobSection = (name) => {
  const match = workflow.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9-]*:\\n|$)`));
  return match ? match[1] : '';
};
for (const job of ['build', 'cross-platform']) {
  for (const command of ['npm run verify:consumer', 'npm run verify:consumer:trading']) {
    if (!jobSection(job).includes(`run: ${command}\n`)) {
      stale.push(`.github/workflows/ci.yml: the ${job} job is missing the "${command}" step`);
    }
  }
}
expectIn(workflow, '.github/workflows/ci.yml', /npm run check:support/, 'the browser-floor gate in the CI build job');
// The new gate's own total is quoted in README; read it from the gate rather than trusting the prose.
const policyCount = Number(
  (execSync('node scripts/check-perf-policy.mjs', { cwd: root, encoding: 'utf8' }).match(/perf policy: (\d+)\//) ?? [])[1]
);
if (!Number.isInteger(policyCount)) {
  console.error('docs counts: could not read the check:perf-policy total');
  process.exit(1);
}
expectIn(readme, 'README.md', new RegExp(`check:perf-policy\\s*#\\s*${policyCount} checks`), `the check:perf-policy row total (${policyCount} checks)`);

// The remaining quoted counts (issue #31). Each count is declared beside its suite in
// scripts/counts/<key>.mjs and aggregated by scripts/expected-counts.mjs; the suite asserts its own run
// against its own declaration, and these doc rows are gated against the aggregated value - so a wrong
// count fails either the suite or this check, never neither.
//
// The aggregate is only as complete as its imports, so completeness is asserted below rather than
// assumed (Rule zero: the colocated-count convention gets its own gate).
const expectCount = (doc, docName, pattern, expected, what, minMatches = 1) => {
  const found = [...doc.matchAll(pattern)].map((m) => Number(m[1]));
  if (found.length < minMatches) stale.push(`${docName}: ${what} not found (${found.length} of ${minMatches})`);
  for (const value of found) {
    if (value !== expected) stale.push(`${docName}: ${what} says ${value}, the suite declares ${expected}`);
  }
};
// README quotes the verify total twice (quick start and the verification block); both are gated.
expectCount(readme, 'README.md', /npm run verify\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.verify, 'the verify row total', 2);
expectCount(readme, 'README.md', /npm run check:style\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.style, 'the check:style row total');
expectCount(readme, 'README.md', /npm run verify:example-trading\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.trading, 'the verify:example-trading row total');
expectCount(readme, 'README.md', /npm run check:pack\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.pack, 'the check:pack row total');
expectCount(readme, 'README.md', /npm run check:release\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.release, 'the check:release row total');
expectCount(readme, 'README.md', /npm run check:support\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.support, 'the check:support row total');
expectCount(readme, 'README.md', /npm run check:contract\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.contract, 'the check:contract row total');
expectCount(readme, 'README.md', /npm run verify:consumer\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.consumer, 'the verify:consumer row total');
expectCount(readme, 'README.md', /npm run verify:consumer:trading\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.consumerTrading, 'the verify:consumer:trading row total');
expectCount(readme, 'README.md', /npm run size\s+#\s+(\d+) checks/g, EXPECTED_COUNTS.sizes, 'the size row total');
expectCount(verification, 'docs/verification.md', /check-size-claims\.mjs`[^\n]*?(\d+) checks/g, EXPECTED_COUNTS.sizes, 'the size-claims total');
expectCount(verification, 'docs/verification.md', /verify\.mjs`[^\n]*?(\d+) library checks/g, EXPECTED_COUNTS.verify, 'the verify total');
expectCount(verification, 'docs/verification.md', /check-style\.mjs`[^\n]*?(\d+) checks over/g, EXPECTED_COUNTS.style, 'the check:style total');
expectCount(verification, 'docs/verification.md', /verify-example\.mjs`[^\n]*?(\d+) checks/g, 10, 'the verify:example total');

// The unit-test total is a documented number too, and it had rotted exactly as predicted: the README
// said 14 while the runner reports 17, because nothing watched it (found 2026-09-29 by a drift audit).
// Counted from the runner itself, like every other total here — TAP is its machine format.
let testTotal;
try {
  testTotal = Number((execSync('node --test --test-reporter=tap', { cwd: root, encoding: 'utf8' }).match(/^# tests (\d+)/m) ?? [])[1]);
} catch {
  // a failing suite exits non-zero; the guard below turns that into a clear message, not a stack trace
}
if (!Number.isInteger(testTotal)) {
  console.error('docs counts: could not read the unit-test total from node --test --test-reporter=tap');
  process.exit(1);
}
expectCount(readme, 'README.md', /npm test\s+#\s+(\d+) unit tests/g, testTotal, 'the unit-test total');
forbidIn(readme, 'README.md', /belong in CI artifacts/, 'the "screenshots belong in CI artifacts" claim (contradicts the committed baselines)');

// Every count file must actually be aggregated. A count file nobody imports would let its suite pass
// on its own declaration while this check never reads the documented total for it - a silent hole, and
// exactly the failure mode the colocated layout introduces. Verified in the failing direction.
const countDir = join(root, 'scripts', 'counts');
const countFiles = readdirSync(countDir).filter((f) => f.endsWith('.mjs'));
const unaggregated = [];
for (const file of countFiles) {
  const mod = await import(`./counts/${file}`);
  for (const key of Object.keys(mod.EXPECTED_COUNTS ?? {})) {
    if (!(key in EXPECTED_COUNTS)) unaggregated.push(`${file} -> ${key}`);
  }
}
if (unaggregated.length > 0) {
  stale.push(`count files not aggregated into expected-counts.mjs: ${unaggregated.join(', ')}`);
}

console.log(
  `docs counts: browser-suite ${compare} compare / ${update} update, verify ${EXPECTED_COUNTS.verify}, `
  + `style ${EXPECTED_COUNTS.style}, trading ${EXPECTED_COUNTS.trading}, pack ${EXPECTED_COUNTS.pack}, `
  + `size ${EXPECTED_COUNTS.sizes}, consumer ${EXPECTED_COUNTS.consumer}, consumer-trading ${EXPECTED_COUNTS.consumerTrading}, contract ${EXPECTED_COUNTS.contract}, support ${EXPECTED_COUNTS.support}, release ${EXPECTED_COUNTS.release}, tests ${testTotal}, perf-policy ${policyCount} — `
  + `README, AGENTS.md, CONTRIBUTING.md and docs/verification.md agree; `
  + `stale-name scan covers all ${markdownFiles.length} markdown files`
);
if (stale.length > 0) {
  for (const line of stale) console.error(`  docs drift: ${line}`);
  process.exit(1);
}
