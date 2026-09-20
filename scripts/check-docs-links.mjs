// Docs integrity gates: (1) every relative Markdown link in docs/** must resolve to an
// existing file; (2) GitHub alert callouts must be one of the five exact types, uppercase,
// on the first line of a blockquote (CONTRIBUTING.md § 9). Exit 1 on any violation.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
expectIn(performanceDoc, 'docs/performance.md', /perf-policy\.mjs/, 'the perf-policy module');
expectIn(pkg, 'package.json', /"check:perf-policy":/, 'the check:perf-policy script');
expectIn(pkg, 'package.json', /check:perf-policy && npm run check:commits/, 'check:perf-policy wired into the ci chain');
const workflow = readDoc('.github/workflows/ci.yml');
expectIn(workflow, '.github/workflows/ci.yml', /npm run check:perf-policy/, 'the perf-policy gate in the CI build job');
// The new gate's own total is quoted in README; read it from the gate rather than trusting the prose.
const policyCount = Number(
  (execSync('node scripts/check-perf-policy.mjs', { cwd: root, encoding: 'utf8' }).match(/perf policy: (\d+)\//) ?? [])[1]
);
if (!Number.isInteger(policyCount)) {
  console.error('docs counts: could not read the check:perf-policy total');
  process.exit(1);
}
expectIn(readme, 'README.md', new RegExp(`check:perf-policy\\s*#\\s*${policyCount} checks`), `the check:perf-policy row total (${policyCount} checks)`);
forbidIn(readme, 'README.md', /belong in CI artifacts/, 'the "screenshots belong in CI artifacts" claim (contradicts the committed baselines)');

console.log(`docs counts: browser-suite ${compare} compare / ${update} update — README, AGENTS.md, CONTRIBUTING.md,
  docs/verification.md agree; stale-name scan covers all ${markdownFiles.length} markdown files`);
if (stale.length > 0) {
  for (const line of stale) console.error(`  docs drift: ${line}`);
  process.exit(1);
}
