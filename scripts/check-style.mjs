#!/usr/bin/env node
/**
 * @trade/ui — CSS authoring contract.
 *
 * The rules CONTRIBUTING.md states in prose, stated here as code. Hand-written stylesheets
 * are small and few; keeping this gate mechanical means a reviewer never has to check
 * these things by eye and a machine can never let them drift.
 *
 * Scope: packages/ui/styles/*.css (the library) AND every app stylesheet under apps/
 * (apps/<name>/src with a .css extension — the example apps demonstrate production
 * practice, so they obey the same laws; ADR-001 owns the scale they read). Exit code 0 = the contract holds.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_COUNTS } from './expected-counts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const stylesDir = resolve(root, 'packages', 'ui', 'styles');
const appsDir = resolve(root, 'apps');

const PREFIX_ALLOWLIST = new Set(['-webkit-font-smoothing']);

/** The shared law set. `namespaced` adds the library-only .ui-* rule. */
function checkFile(checks, file, css, { namespaced }) {
  const check = (name, violations) =>
    checks.push({ name, pass: violations.length === 0, detail: violations.slice(0, 5).join(' | ') || 'clean' });
  const decls = [...css.matchAll(/([-\w]+)\s*:\s*([^;{}]+);/g)].map((m) => ({ prop: m[1], value: m[2].trim(), at: m[0] }));

  // 1. colour comes from tokens only — no literals anywhere in a declaration value
  check(
    `${file}: no raw colour literals`,
    decls
      .filter(({ value }) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(value) || value.split(/[\s/,]+/).includes('white') || value.split(/[\s/,]+/).includes('black'))
      .map(({ at }) => at)
  );

  // 2. layout is direction-agnostic (RTL flips for free) — logical properties only
  check(
    `${file}: no physical directional properties`,
    decls
      .filter(
        ({ prop, value }) =>
          /^(margin|padding|border|inset|overscroll-behavior)-(left|right)/.test(prop) ||
          (prop === 'text-align' && /^(left|right)$/.test(value))
      )
      .map(({ at }) => `${at} → use the inline-start/end equivalent`)
  );

  // 3. stacking and elevation are tokened scales, not local decisions
  check(
    `${file}: z-index only via --ui-z-*`,
    decls.filter(({ prop, value }) => prop === 'z-index' && !value.startsWith('var(--ui-z-')).map(({ at }) => at)
  );
  check(
    `${file}: box-shadow only via --ui-elevation-*`,
    decls.filter(({ prop, value }) => prop === 'box-shadow' && !value.startsWith('var(--ui-elevation-')).map(({ at }) => at)
  );

  // 4. motion is off: the only allowed transition/animation value is none
  check(
    `${file}: no animated transitions or animations`,
    decls.filter(({ prop, value }) => /^(transition|animation)$/.test(prop) && value !== 'none').map(({ at }) => at)
  );

  // 5. specificity discipline: no !important, ever
  check(`${file}: no !important`, decls.filter(({ value }) => value.includes('!important')).map(({ at }) => at));

  // 6. type scale is a token
  check(
    `${file}: font-size only via tokens or inherit`,
    decls.filter(({ prop, value }) => prop === 'font-size' && !/^(var\(--ui-font-size-|inherit)/.test(value)).map(({ at }) => at)
  );

  // 7. namespace: library classes we author live under .ui- (app stylesheets target the
  //    library's classes for shell integration, so this rule is library-only)
  if (namespaced) {
    check(
      `${file}: classes are namespaced .ui-*`,
      [...css.matchAll(/(?<![\w-])\.([a-zA-Z][\w-]*)/g)].filter((m) => !/^ui-/.test(m[1]) && !/^(dark|light)$/.test(m[1])).map((m) => `.${m[1]}`)
    );
  }

  // 8. no engine-specific prefixes beyond the allowlist
  check(
    `${file}: no vendor prefixes (allowlist: -webkit-font-smoothing)`,
    [...new Set([...css.matchAll(/-(?:webkit|moz|ms|o)-[\w-]+/g)].map((m) => m[0]))].filter((p) => !PREFIX_ALLOWLIST.has(p))
  );

  // 9. a stylesheet that ships is a resolved stylesheet — leftover git conflict
  //  markers are malformed CSS the browser silently recovers from (last
  //  declaration wins), so a botched merge must fail the gate, not the diff
  check(
    `${file}: no merge-conflict markers`,
    [...css.matchAll(/^(?:<{7}|={7}|>{7})/gm)].map((m) => m[0])
  );
}

const checks = [];

for (const file of readdirSync(stylesDir).filter((f) => f.endsWith('.css'))) {
  const css = readFileSync(resolve(stylesDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  checkFile(checks, file, css, { namespaced: true });
}

const appSheets = [];
if (existsSync(appsDir)) {
  for (const app of readdirSync(appsDir)) {
    const src = resolve(appsDir, app, 'src');
    for (const f of existsSync(src) ? readdirSync(src).filter((f) => f.endsWith('.css')) : []) {
      appSheets.push({ name: `${app}/src/${f}`, path: resolve(src, f) });
    }
  }
}
for (const { name, path } of appSheets) {
  const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  checkFile(checks, name, css, { namespaced: false });
}

if (checks.length !== EXPECTED_COUNTS.style) {
  console.error(
    `style contract: ${checks.length} checks ran but scripts/expected-counts.mjs declares ${EXPECTED_COUNTS.style}. `
    + 'Update that number and the docs it feeds in the same change, then run check:docs.'
  );
  process.exit(1);
}
const failed = checks.filter((c) => !c.pass);
console.log(`style contract: ${checks.length - failed.length}/${checks.length} checks passed (${readdirSync(stylesDir).filter((f) => f.endsWith('.css')).length} library + ${appSheets.length} app stylesheets)`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
process.exit(failed.length ? 1 : 0);
