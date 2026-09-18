// Docs link integrity: every relative Markdown link in docs/** must resolve to an
// existing file. The docs/README.md index promises 8 guide pages; this gate keeps the
// promise checkable (Rule zero — a rule without a gate rots). Anchors are not validated;
// external http(s) links are skipped. Exit 1 on any dangling link.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');

const markdownFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.md')) markdownFiles.push(full);
  }
})(docsDir);

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
let links = 0;
const broken = [];

for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8');
  const display = relative(root, file);
  // strip fenced code blocks so examples of links aren't checked
  const prose = source.replace(/```[\s\S]*?```/g, '');
  for (const [, target] of prose.matchAll(LINK)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    links += 1;
    const resolved = resolve(dirname(file), decodeURIComponent(target.split('#')[0]));
    if (!existsSync(resolved)) broken.push(`${display} -> ${target}`);
  }
}

console.log(`docs links: ${links - broken.length}/${links} resolve (${markdownFiles.length} files)`);
if (broken.length > 0) {
  for (const line of broken) console.error(`  dangling: ${line}`);
  process.exit(1);
}
