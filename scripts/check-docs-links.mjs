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
