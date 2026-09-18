#!/usr/bin/env node
/**
 * @trade/ui — CSS authoring contract.
 *
 * The rules CONTRIBUTING.md states in prose, stated here as code. Hand-written stylesheets
 * are small and few; keeping this gate mechanical means a reviewer never has to check
 * these things by eye and a machine can never let them drift.
 *
 * Scope: packages/ui/styles/*.css (hand-written only — generated output is not reviewed).
 * Exit code 0 = the contract holds.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = resolve(here, '..', 'packages', 'ui', 'styles');

const files = readdirSync(stylesDir).filter((f) => f.endsWith('.css'));
const checks = [];
const check = (name, violations) =>
  checks.push({ name, pass: violations.length === 0, detail: violations.slice(0, 5).join(' | ') || 'clean' });

// The one sanctioned engine flag; everything else must be baseline CSS.
const PREFIX_ALLOWLIST = new Set(['-webkit-font-smoothing']);

for (const file of files) {
  const css = readFileSync(resolve(stylesDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  // Parse declarations once: "prop: value;" pairs.
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

  // 7. namespace: every class we author lives under .ui-
  check(
    `${file}: classes are namespaced .ui-*`,
    [...css.matchAll(/(?<![\w-])\.([a-zA-Z][\w-]*)/g)].filter((m) => !/^ui-/.test(m[1]) && !/^(dark|light)$/.test(m[1])).map((m) => `.${m[1]}`)
  );

  // 8. no engine-specific prefixes beyond the allowlist
  check(
    `${file}: no vendor prefixes (allowlist: -webkit-font-smoothing)`,
    [...new Set([...css.matchAll(/-(?:webkit|moz|ms|o)-[\w-]+/g)].map((m) => m[0]))].filter((p) => !PREFIX_ALLOWLIST.has(p))
  );
}

const failed = checks.filter((c) => !c.pass);
console.log(`style contract: ${checks.length - failed.length}/${checks.length} checks passed (${files.length} stylesheets)`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
process.exit(failed.length ? 1 : 0);
