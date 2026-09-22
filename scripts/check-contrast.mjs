#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * @trade/ui — design-system contrast contract.
 *
 * Enforces WCAG contrast on the *token relationships*, for every theme, so a bad colour
 * pairing cannot reach a component. axe-core only sees what is rendered on one page; this
 * sees the whole system, including states that no test currently renders.
 *
 *   text roles     4.5:1  (WCAG 1.4.3 AA)
 *   UI boundaries  3.0:1  (WCAG 1.4.11 non-text contrast)
 *
 * Exit code 0 = every pair in every theme passes.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(resolve(here, '..', 'packages', 'tokens', 'tokens.json'), 'utf8'));
const P = t.primitive;

const hexToRgb = (h) => {
  const s = h.replace('#', '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
const lum = ([r, g, b]) => {
  const ch = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const contrast = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** resolve "{group.name[.variant]}" or a literal hex; null for alpha values */
const resolveValue = (v) => {
  if (typeof v !== 'string') return null;
  const m = v.match(/^\{([^}]+)\}$/);
  if (!m) return v.startsWith('#') ? v : null;
  const [ns, name, variant] = m[1].split('.');
  const entry = P[ns]?.[name];
  if (entry === undefined) return null;
  return variant === undefined ? entry : entry[variant];
};

// each theme must satisfy these pairs
const TEXT = 4.5;
const UI = 3.0;
const PAIRS = [
  ['onSurface', 'surface', TEXT, 'body text on a card'],
  ['onSurface', 'background', TEXT, 'body text on the app background'],
  ['onSurface', 'surface-1', TEXT, 'body text on a raised surface'],
  ['onSurface', 'rowAlt', TEXT, 'body text on a zebra row'],
  ['onSurfaceMuted', 'surface', TEXT, 'secondary text on a card'],
  ['onSurfaceMuted', 'background', TEXT, 'secondary text on the background'],
  ['onSurfaceMuted', 'surface-1', TEXT, 'secondary text on a raised surface'],
  // Disabled controls are exempt from WCAG 1.4.3; the floor asserts the label stays
  // visible on its fill while remaining clearly quieter than any enabled label.
  ['onSurfaceDisabled', 'surface-1', 2.0, 'disabled label on the disabled fill (WCAG-exempt, visibility floor)'],
  ['onSurfaceMuted', 'rowAlt', TEXT, 'secondary text on a zebra row'],
  ['positive', 'surface', TEXT, 'gain value on a card'],
  ['positive', 'rowAlt', TEXT, 'gain value on a zebra row'],
  ['negative', 'surface', TEXT, 'loss value on a card'],
  ['negative', 'rowAlt', TEXT, 'loss value on a zebra row'],
  ['primary', 'surface', TEXT, 'primary-coloured text (outline button, active tab)'],
  ['primary', 'surface-1', TEXT, 'primary-coloured label on the outline button fill'],
  ['onPrimary', 'primary', TEXT, 'label on a filled primary button'],
  ['onSecondary', 'secondary', TEXT, 'label on a filled secondary button'],
  ['onError', 'error', TEXT, 'label on a destructive button'],
  ['focusRing', 'surface', UI, 'focus ring against a card'],
  ['focusRing', 'background', UI, 'focus ring against the background'],
  ['borderControl', 'surface', UI, 'input border against a card (WCAG 1.4.11)'],
  ['borderControl', 'surface-1', UI, 'input border against the input fill'],
  ['borderControl', 'background', UI, 'input border against the background']
];

const failures = [];
let checked = 0;

for (const [themeName, roles] of Object.entries(t.themes)) {
  for (const [fgRole, bgRole, min, why] of PAIRS) {
    const fg = resolveValue(roles[fgRole]);
    const bg = resolveValue(roles[bgRole]);
    if (!fg || !bg) continue; // alpha or missing -> not a flat pair
    checked++;
    const ratio = contrast(hexToRgb(fg), hexToRgb(bg));
    if (ratio < min) {
      failures.push({ theme: themeName, pair: `${fgRole} on ${bgRole}`, ratio: Number(ratio.toFixed(2)), min, fg, bg, why });
    }
  }
}

const themes = Object.keys(t.themes);
console.log(`contrast contract: ${checked} pairs across ${themes.length} themes (${themes.join(', ')})`);
for (const f of failures) {
  console.log(`  FAIL  ${f.theme.padEnd(14)} ${f.pair.padEnd(26)} ${String(f.ratio).padStart(5)}:1  (needs ${f.min})  ${f.fg} on ${f.bg}  — ${f.why}`);
}
if (!failures.length) {
  console.log('  all pairs pass');
} else {
  console.log(`\n${failures.length} failing pair(s). Fix the token mapping, not the test.`);
}
process.exit(failures.length === 0 ? 0 : 1);
