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
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.md')) markdownFiles.push(full);
  }
})(docsDir);
for (const f of readdirSync(root)) {
  if (f.endsWith('.md')) markdownFiles.push(join(root, f));
}

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

// Row-specific: README's check:style row legitimately quotes its own 72 checks —
// only the browser-suite rows are governed here.
expectIn(readme, 'README.md', new RegExp(`verify:browser\\s*#\\s*${compare} checks`), `the verify:browser row total (${compare} checks)`);
expectIn(readme, 'README.md', new RegExp(`${compare}/${compare}`), `the clean-run total (${compare}/${compare})`);
expectIn(agents, 'AGENTS.md', new RegExp(`browser-suite\\.mjs\\s+${compare} checks`), 'the repository-map browser-suite count');
expectIn(agents, 'AGENTS.md', /baselines\/<platform>/, 'the baselines reviewed-exception (baselines/<platform>/)');
expectIn(contributing, 'CONTRIBUTING.md', /baselines\/<platform>/, 'the baselines reviewed-exception (baselines/<platform>/)');
expectIn(readme, 'README.md', /baselines\/<platform>/, 'the baselines reviewed-exception (baselines/<platform>/)');
forbidIn(readme, 'README.md', /belong in CI artifacts/, 'the "screenshots belong in CI artifacts" claim (contradicts the committed baselines)');

console.log(`docs counts: browser-suite ${compare} compare / ${update} update — README, AGENTS.md, CONTRIBUTING.md agree`);
if (stale.length > 0) {
  for (const line of stale) console.error(`  docs drift: ${line}`);
  process.exit(1);
}
