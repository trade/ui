#!/usr/bin/env node
/**
 * @trade/tokens — build step.
 *
 * Three-tier model:
 *   primitive  raw values we own            -> --ui-ref-*
 *   theme      role -> primitive reference  -> --ui-<role>: var(--ui-ref-*)
 *   structural scale/type/depth (theme-less) -> --ui-space-*, --ui-font-*, ...
 *
 * Emitting roles as `var(--ui-ref-*)` is what makes the system ours and extensible:
 * a consumer can retheme by overriding a single primitive and every role follows,
 * without touching a component or shipping a new stylesheet.
 *
 * The build FAILS if any theme is missing a role or if a reference dangles, so
 * token drift cannot reach a consumer.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, 'tokens.json');
const outDir = resolve(here, 'dist');
mkdirSync(outDir, { recursive: true });

const t = JSON.parse(readFileSync(source, 'utf8'));
const P = t.primitive;
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();

const errors = [];
const refName = (ns, name, variant) => {
  const parts = [ns === 'colour' ? null : ns, name, variant].filter((p) => p !== undefined && p !== null).map(kebab);
  return `--ui-ref-${parts.join('-')}`;
};

/** resolve "{namespace.name[.variant]}" to a primitive CSS var; raw values pass through */
function resolveRef(value, where) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^\{([^}]+)\}$/);
  if (!m) return null; // literal value
  const [ns, name, variant] = m[1].split('.');
  const bucket = P[ns];
  if (!bucket) {
    errors.push(`${where}: unknown primitive namespace "${ns}"`);
    return null;
  }
  const entry = bucket[name];
  if (entry === undefined) {
    errors.push(`${where}: unknown primitive "${ns}.${name}"`);
    return null;
  }
  if (variant !== undefined) {
    if (typeof entry !== 'object' || entry[variant] === undefined) {
      errors.push(`${where}: unknown primitive variant "${ns}.${name}.${variant}"`);
      return null;
    }
  }
  return `var(${refName(ns, name, variant)})`;
}

// ---- primitive layer ----
const refLines = [];
for (const [group, bucket] of Object.entries(P.colour)) {
  for (const [name, value] of Object.entries(bucket)) {
    refLines.push(`  ${refName('colour', group, name)}: ${value};`);
  }
}
for (const [name, variants] of Object.entries(P.alpha)) {
  for (const [variant, value] of Object.entries(variants)) {
    refLines.push(`  ${refName('alpha', name, variant)}: ${value};`);
  }
}

// ---- theme layer ----
const themeNames = Object.keys(t.themes);
const roleSets = themeNames.map((n) => Object.keys(t.themes[n]).sort().join(','));
const reference = roleSets[0];
themeNames.forEach((n, i) => {
  if (roleSets[i] !== reference) {
    const missing = reference.split(',').filter((r) => !roleSets[i].split(',').includes(r));
    const extra = roleSets[i].split(',').filter((r) => !reference.split(',').includes(r));
    errors.push(`theme "${n}" diverges from the role set (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
  }
});

const roles = Object.keys(t.themes[t.defaultTheme]).sort();
const themeBlock = (themeName, indent = '  ') =>
  roles
    .map((role) => {
      const raw = t.themes[themeName][role];
      const resolved = resolveRef(raw, `theme "${themeName}".${role}`);
      return `${indent}--ui-${kebab(role)}: ${resolved ?? raw};`;
    })
    .join('\n');

// ---- structural layer (theme-independent) ----
const structural = [];
const push = (n, v) => structural.push(`  ${n}: ${v};`);
push('--ui-density', String(P.density.comfortable));
for (const [k, v] of Object.entries(P.density)) push(`--ui-density-${k}`, String(v));
for (const [k, v] of Object.entries(P.space)) push(`--ui-space-${k}`, v);
for (const [k, v] of Object.entries(P.radius)) push(`--ui-radius-${k}`, v);
for (const [k, v] of Object.entries(P.size ?? {})) push(`--ui-size-${kebab(k)}`, v);
push('--ui-font-family', P.font.family);
push('--ui-font-numeric', P.font.numeric);
for (const [k, v] of Object.entries(P.font.size)) push(`--ui-font-size-${k}`, v);
for (const [k, v] of Object.entries(P.font.lineHeight)) push(`--ui-line-${k}`, v);
for (const [k, v] of Object.entries(P.elevation)) push(`--ui-elevation-${k}`, v);
for (const [k, v] of Object.entries(P.zIndex)) push(`--ui-z-${k}`, String(v));
for (const [k, v] of Object.entries(P.opacity ?? {})) push(`--ui-opacity-${k}`, v);
for (const [k, v] of Object.entries(P.motion)) {
  if (k === 'enabled') continue;
  push(`--ui-motion-${k}`, v);
}

const css = `/* @trade/ui — generated from tokens.json. DO NOT EDIT BY HAND. */
/* project UI v${t.version} · tiers: primitive -> theme role -> component · motion.enabled=${P.motion.enabled} */

:root {
  color-scheme: light dark;

  /* ---- tier 1: primitives (raw values we own) ---- */
${refLines.join('\n')}

  /* ---- structural scale (theme-independent) ---- */
${structural.join('\n')}

  /* motion is inert in v0.x */
  --ui-transition: none;

  /* ---- tier 2: theme roles for "${t.defaultTheme}" (references into tier 1) ---- */
${themeBlock(t.defaultTheme)}
}

/* explicit theme overrides — one attribute on <html> is the entire theme mechanism.
   color-scheme follows the applied theme so native controls (select arrows, scrollbars,
   form glyphs) render for the same polarity the roles do. */
${themeNames
  .filter((n) => n !== t.defaultTheme && n !== 'dark')
  .map((n) => `[data-theme="${n}"] {\n  color-scheme: light;\n${themeBlock(n)}\n}`)
  .join('\n\n')}

[data-theme="dark"] {
  color-scheme: dark;
${themeBlock('dark')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
${themeBlock('dark', '    ')}
  }
}
`;

writeFileSync(resolve(outDir, 'tokens.css'), css, 'utf8');
writeFileSync(
  resolve(outDir, 'tokens.ts'),
  `// @trade/ui — generated from tokens.json. DO NOT EDIT BY HAND.\nexport const tokens = ${JSON.stringify(t, null, 2)} as const;\nexport type Tokens = typeof tokens;\nexport type ThemeName = keyof typeof tokens.themes;\nexport type ThemeRole = keyof (typeof tokens.themes)['${t.defaultTheme}'];\nexport default tokens;\n`,
  'utf8'
);

const vars = new Set([...css.matchAll(/--ui-[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]));
const unresolved = roles.filter((r) => !t.themes[t.defaultTheme][r].startsWith('{'));

if (errors.length) {
  console.error('TOKEN BUILD FAILED:\n  ' + errors.join('\n  '));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      out: ['dist/tokens.css', 'dist/tokens.ts'],
      primitiveRefs: refLines.length,
      themes: themeNames,
      rolesPerTheme: roles.length,
      literalRolesInDefaultTheme: unresolved.length,
      customProperties: vars.size,
      motionEnabled: P.motion.enabled
    },
    null,
    2
  )
);
