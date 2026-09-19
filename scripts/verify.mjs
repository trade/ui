/**
 * @trade/ui — verification.
 *
 * Runs in two phases so server and browser environments stay honest:
 *   Phase A (no DOM globals)  → package contract, built CSS, server-rendered markup, sizes
 *   Phase B (jsdom installed)  → real DOM interaction tests
 *
 * Exit code 0 = every check passed.
 */
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveBaselinePlatform, baselineSetIsComplete } from './baseline-gate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const uiPkg = resolve(root, 'packages', 'ui');
const dist = resolve(uiPkg, 'dist');
const h = React.createElement;

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

// ════════════ PHASE A — server side (no DOM) ════════════
const ui = await import('../packages/ui/dist/index.js');
const { sampleScreen, harness } = await import('./sample-screen.mjs');

// ── package contract ──
const pkg = JSON.parse(readFileSync(resolve(uiPkg, 'package.json'), 'utf8'));
const depCount = Object.keys(pkg.dependencies ?? {}).length;
check('zero runtime dependencies', depCount === 0, `dependencies = ${JSON.stringify(pkg.dependencies ?? {})}`);
check(
  'React is a peer, not a bundled dependency',
  Boolean(pkg.peerDependencies?.react && pkg.peerDependencies?.['react-dom']),
  JSON.stringify(pkg.peerDependencies)
);
check('sideEffects:false (tree-shakeable)', pkg.sideEffects === false, `sideEffects=${pkg.sideEffects}`);
check(
  'exports map exposes JS + styles',
  Boolean(pkg.exports?.['.'] && pkg.exports?.['./styles.css']),
  Object.keys(pkg.exports ?? {}).join(', ')
);

// ── build artifacts ──
const artifacts = ['index.js', 'index.cjs', 'index.d.ts', 'ui.css'];
const missing = artifacts.filter((f) => !existsSync(resolve(dist, f)));
const bytes = (p) => readFileSync(p).length;
check(
  'build artifacts present',
  missing.length === 0,
  missing.length ? `missing: ${missing.join(', ')}` : artifacts.map((f) => `${f}=${bytes(resolve(dist, f))}B`).join(', ')
);
const perComponent = readdirSync(resolve(dist, 'components')).filter((f) => f.endsWith('.css'));
check('per-component CSS emitted', perComponent.length >= 7, `${perComponent.length} files`);

// ── generated CSS ──
const css = readFileSync(resolve(dist, 'ui.css'), 'utf8');
const vars = new Set([...css.matchAll(/--ui-[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]));
check('design tokens emitted into the stylesheet', vars.size >= 60, `${vars.size} unique custom properties`);

const transitions = [...css.matchAll(/transition\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
const nonInert = transitions.filter((v) => v !== 'none');
check(
  'stylesheet contains no animated transitions',
  nonInert.length === 0,
  `transition declarations=${transitions.length}, non-inert=${nonInert.length}`
);

const names = (block) => [...block.matchAll(/(--ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]).sort();
// three-tier output: roles live after the "tier 2" marker; other themes follow as attribute blocks
const lightBlock = css.slice(css.indexOf('tier 2: theme roles'), css.indexOf('[data-theme="high-contrast"]'));
const darkBlock = css.slice(css.indexOf('[data-theme="dark"] {'), css.indexOf('@media'));
const lightNames = names(lightBlock);
const darkNames = names(darkBlock);
check(
  'light and dark expose identical token names',
  lightNames.length > 0 && JSON.stringify(lightNames) === JSON.stringify(darkNames),
  `light=${lightNames.length}, dark=${darkNames.length}`
);

// architecture discipline: the theme layer must reference primitives, never hard-code values —
// in EVERY theme, not just the default one
const themeBlocks = {
  light: lightBlock,
  'high-contrast': css.slice(css.indexOf('[data-theme="high-contrast"]'), css.indexOf('[data-theme="dark"]')),
  dark: darkBlock
};
const literalRoles = Object.entries(themeBlocks).flatMap(([theme, block]) =>
  [...block.matchAll(/--ui-([a-z0-9-]+)\s*:\s*([^;]+);/g)]
    .filter(([, , v]) => !v.trim().startsWith('var('))
    .map(([, role, v]) => `${theme}.${role}=${v.trim()}`)
);
check(
  'every theme role references a primitive (no hard-coded colours, all themes)',
  !literalRoles.length && Object.values(themeBlocks).every((b) => (b.match(/--ui-[a-z0-9-]+\s*:/g) ?? []).length >= 20),
  literalRoles.length ? literalRoles.join(', ') : 'light, dark and high-contrast all pure role→primitive'
);
check(
  'primitive tier is emitted as overridable custom properties',
  (css.match(/--ui-ref-[a-z0-9-]+\s*:/g) ?? []).length >= 30,
  `${(css.match(/--ui-ref-[a-z0-9-]+\s*:/g) ?? []).length} --ui-ref-* tokens`
);
check(
  'high-contrast theme is generated',
  css.includes('[data-theme="high-contrast"]') && /high-contrast/.test(css),
  `block present=${css.includes('[data-theme="high-contrast"]')}`
);

// ── sizes ──
const jsGz = gzipSync(readFileSync(resolve(dist, 'index.js'))).length;
const cjsGz = gzipSync(readFileSync(resolve(dist, 'index.cjs'))).length;
const cssGz = gzipSync(readFileSync(resolve(dist, 'ui.css'))).length;
check(
  'bundle sizes within budget',
  cssGz < 12 * 1024 && jsGz < 30 * 1024,
  `index.js=${jsGz}B gz, index.cjs=${cjsGz}B gz, ui.css=${cssGz}B gz (budgets: css<12KB, js<30KB)`
);

// ── server-rendered markup ──
const markup = renderToStaticMarkup(sampleScreen(ui, h));
check(
  'SSR: ARIA grid with honest row count',
  /role="grid"/.test(markup) && /aria-rowcount="5001"/.test(markup),
  `aria-rowcount=${(markup.match(/aria-rowcount="(\d+)"/) ?? [])[1]}`
);
check(
  'SSR: dense table + tabular numeric cells',
  /ui-table--dense/.test(markup) && (markup.match(/ui-cell--numeric/g) ?? []).length >= 6,
  `numeric cells=${(markup.match(/ui-cell--numeric/g) ?? []).length}`
);
check(
  'SSR: gain/loss carries a direction glyph, not colour alone',
  markup.includes('▲') && markup.includes('▼'),
  `up glyph=${markup.includes('▲')}, down glyph=${markup.includes('▼')}`
);
check(
  'SSR: tabs + modal dialog semantics',
  /role="tablist"/.test(markup) && /aria-selected="true"/.test(markup) && /aria-modal="true"/.test(markup),
  `tablist=${/role="tablist"/.test(markup)}, selected tab=${/aria-selected="true"/.test(markup)}, modal=${/aria-modal="true"/.test(markup)}`
);
check(
  'SSR: non-modal popover is honest about modality',
  /aria-modal="false"/.test(markup) && /aria-haspopup="dialog"/.test(markup),
  `aria-modal=false=${/aria-modal="false"/.test(markup)}, haspopup=${/aria-haspopup="dialog"/.test(markup)}`
);
check(
  'SSR: listbox select announces the popup and renders the native variant alongside',
  /aria-haspopup="listbox"/.test(markup) && (markup.match(/<select /g) ?? []).length >= 1,
  `haspopup=listbox=${/aria-haspopup="listbox"/.test(markup)}, native selects=${(markup.match(/<select /g) ?? []).length}`
);
check('SSR: no inline animation in output', !/transition\s*:/.test(markup), 'inline transition count=0');

// ── scale ──
const N = 5000;
const bigRows = [];
for (let i = 0; i < N; i++) {
  bigRows.push({ symbol: 'SYM' + i, last: 100 + (i % 500) / 10, chg: i % 2 ? 0.42 : -0.31 });
}
const bigColumns = [
  { key: 'symbol', header: 'Symbol', width: 96 },
  { key: 'last', header: 'Last', width: 96, numeric: true },
  {
    key: 'chg',
    header: 'Chg',
    width: 80,
    numeric: true,
    render: (r) =>
      h(ui.Cell, { numeric: true, tone: r.chg >= 0 ? 'positive' : 'negative', direction: r.chg >= 0 ? 'up' : 'down' }, Math.abs(r.chg).toFixed(2))
  }
];
const t0 = performance.now();
const bigMarkup = renderToStaticMarkup(
  h(ui.DataTable, { columns: bigColumns, rows: bigRows, getRowKey: (r) => r.symbol, density: 'dense', rowCount: 200000, focusableRows: true })
);
const ssrMs = Math.round(performance.now() - t0);
const domRows = (bigMarkup.match(/<tr /g) ?? []).length;
check(
  `renders ${N.toLocaleString()} rows with ARIA scoped to the full dataset`,
  domRows === N + 1 && /aria-rowcount="200001"/.test(bigMarkup),
  `dom rows=${domRows}, aria-rowcount=200001, markup=${Math.round(bigMarkup.length / 1024)}KB, SSR=${ssrMs}ms`
);

// ════════════ PHASE B — browser-like DOM (jsdom) ════════════
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle']) {
  try {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  } catch {
    /* ignore read-only globals */
  }
}
try {
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
} catch {
  /* ignore */
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom's matchMedia always reports matches:false, which would hide the system-theme path.
// Stub it to report a dark OS preference so that path is testable.
dom.window.matchMedia = (query) => ({
  matches: /prefers-color-scheme:\s*dark/.test(query),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false
});

const { createRoot } = await import('react-dom/client');
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const keydown = (el, key) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));

const container = document.getElementById('root');
const reactRoot = createRoot(container);
await React.act(async () => {
  reactRoot.render(harness(ui, h, React));
});

const activeTabIndex = () =>
  [...container.querySelectorAll('[role="tab"]')].findIndex((t) => t.getAttribute('aria-selected') === 'true');

await React.act(async () => click(container.querySelectorAll('[role="tab"]')[1]));
const afterClick = activeTabIndex();
check(
  'click switches the active tab and its panel',
  afterClick === 1 && Boolean(container.querySelector('#panel-orders')),
  `selectedIndex=${afterClick}, panel-orders present=${Boolean(container.querySelector('#panel-orders'))}`
);

const tabEls = container.querySelectorAll('[role="tab"]');
await React.act(async () => {
  tabEls[1].focus();
  keydown(tabEls[1], 'ArrowRight');
});
const afterArrow = activeTabIndex();
check('ArrowRight moves selection (roving tabindex)', afterArrow === 2, `selectedIndex=${afterArrow} (expected 2)`);

await React.act(async () => click(container.querySelector('#open-dialog')));
const dialog = document.body.querySelector('[role="dialog"]');
const focusInside = Boolean(dialog && document.activeElement && dialog.contains(document.activeElement));
check(
  'dialog opens and receives focus',
  Boolean(dialog) && focusInside,
  `dialog present=${Boolean(dialog)}, focused=${document.activeElement?.className || document.activeElement?.tagName}`
);

await React.act(async () => keydown(document, 'Escape'));
check(
  'Escape closes the dialog',
  !document.body.querySelector('[role="dialog"]'),
  `dialog still present=${Boolean(document.body.querySelector('[role="dialog"]'))}`
);

await React.act(async () => click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Dark')));
check(
  'provider theme toggle applies data-theme to <html>',
  document.documentElement.getAttribute('data-theme') === 'dark',
  `data-theme=${document.documentElement.getAttribute('data-theme')}`
);

// ── zero-render theme switch ──
let probeRenders = 0;
function Probe() {
  probeRenders++;
  return h('span', null, 'probe');
}
const probeHost = document.createElement('div');
document.body.appendChild(probeHost);
const probeRoot = createRoot(probeHost);
await React.act(async () => probeRoot.render(h(Probe)));
probeRenders = 0;
document.documentElement.removeAttribute('data-theme');
ui.setThemeAttribute('dark');
check(
  'theme switch via DOM attribute causes ZERO React renders',
  probeRenders === 0 && document.documentElement.getAttribute('data-theme') === 'dark',
  `react renders=${probeRenders}, data-theme=${document.documentElement.getAttribute('data-theme')}`
);

// ── system theme resolution ──
const themeHost = document.createElement('div');
document.body.appendChild(themeHost);
let themeSeen = null;
function ThemeProbe() {
  const t = ui.useTheme();
  themeSeen = t;
  return h('span', null, `${t.theme}/${t.resolved}`);
}
const themeRoot = createRoot(themeHost);
await React.act(async () => themeRoot.render(h(ui.ThemeProvider, { theme: 'system' }, h(ThemeProbe))));
check(
  'useTheme().resolved follows the OS preference when theme is system',
  themeSeen?.theme === 'system' && themeSeen?.resolved === 'dark',
  `theme=${themeSeen?.theme}, resolved=${themeSeen?.resolved} (matchMedia stubbed to dark)`
);

// ── selection controls + feedback (previously untested) ──
const miscHost = document.createElement('div');
document.body.appendChild(miscHost);
let checkboxChanges = 0;
function MiscProbe() {
  const [on, setOn] = React.useState(false);
  return h(
    'div',
    null,
    h(ui.Checkbox, { label: 'Bracket', checked: on, onChange: (e) => { checkboxChanges++; setOn(e.target.checked); } }),
    h(ui.Radio, { label: 'Day', name: 'tif', defaultChecked: true }),
    h(ui.Switch, { label: 'Live', defaultChecked: true }),
    h(ui.Banner, { tone: 'danger', title: 'Rejected' }, 'Insufficient buying power'),
    h(ui.ToastRegion, null, h(ui.Toast, { tone: 'success', title: 'Filled' }, 'Order 4821'))
  );
}
const miscRoot = createRoot(miscHost);
await React.act(async () => miscRoot.render(h(MiscProbe)));
const cb = miscHost.querySelector('input[type="checkbox"]:not([role="switch"])');
await React.act(async () => click(cb));
check('Checkbox toggles and fires onChange', checkboxChanges === 1 && cb.checked === true, `changes=${checkboxChanges}, checked=${cb.checked}`);
const sw = miscHost.querySelector('[role="switch"]');
const radio = miscHost.querySelector('input[type="radio"]');
check('Selection controls render with correct semantics', Boolean(sw && radio), `role=switch=${Boolean(sw)}, radio=${Boolean(radio)}`);
const banner = miscHost.querySelector('.ui-banner--danger');
const region = miscHost.querySelector('[role="region"][aria-label="Notifications"]');
const liveToast = miscHost.querySelector('.ui-toast[aria-live="polite"]');
check(
  'Banner tone + toast live-region semantics',
  Boolean(banner && region && liveToast) && banner.getAttribute('role') === 'status',
  `danger banner=${Boolean(banner)}, toast region=${Boolean(region)}, polite toast=${Boolean(liveToast)}`
);

// ── keyboard coverage for tablist and dialog ──
await React.act(async () => {
  const t = container.querySelectorAll('[role="tab"]');
  t[2].focus();
  keydown(t[2], 'Home');
});
check('Home jumps to the first tab', activeTabIndex() === 0, `selectedIndex=${activeTabIndex()}`);
await React.act(async () => {
  const t = container.querySelectorAll('[role="tab"]');
  t[0].focus();
  keydown(t[0], 'End');
});
check('End jumps to the last tab', activeTabIndex() === 2, `selectedIndex=${activeTabIndex()}`);

await React.act(async () => click(container.querySelector('#open-dialog')));
const dlg = document.body.querySelector('[role="dialog"]');
const focusables = [...dlg.querySelectorAll('button')];
const firstBtn = focusables[0];
const lastBtn = focusables[focusables.length - 1];
await React.act(async () => {
  lastBtn.focus();
  keydown(dlg, 'Tab');
});
check(
  'Tab from the last control wraps to the first (focus trap)',
  document.activeElement === firstBtn,
  `activeElement=${document.activeElement?.textContent?.trim()} (expected "${firstBtn.textContent.trim()}")`
);
await React.act(async () => {
  firstBtn.focus();
  dlg.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
});
check(
  'Shift+Tab from the first control wraps to the last',
  document.activeElement === lastBtn,
  `activeElement=${document.activeElement?.textContent?.trim()} (expected "${lastBtn.textContent.trim()}")`
);
await React.act(async () => keydown(document, 'Escape'));

// ── menu: open, ARIA, keyboard navigation, disabled skipping, escape + outside close ──
const menuTrigger = container.querySelector('#menu-trigger');
await React.act(async () => {
  menuTrigger.focus();
  click(menuTrigger);
});
const menu = document.body.querySelector('[role="menu"]');
const menuItems = menu ? [...menu.querySelectorAll('[role="menuitem"]')] : [];
check(
  'click opens the menu with honest ARIA',
  Boolean(menu) &&
    menuItems.length === 3 &&
    menuTrigger.getAttribute('aria-expanded') === 'true' &&
    menu.getAttribute('aria-label') === 'Actions',
  `menu present=${Boolean(menu)}, items=${menuItems.length}, aria-expanded=${menuTrigger.getAttribute('aria-expanded')}, aria-label=${menu?.getAttribute('aria-label')}`
);
check(
  'opening focuses the first enabled item (disabled skipped)',
  document.activeElement === menuItems[0],
  `activeElement=${document.activeElement?.id || document.activeElement?.tagName} (expected menu-reload)`
);
await React.act(async () => keydown(menu, 'ArrowDown'));
check(
  'ArrowDown skips the disabled item',
  document.activeElement === container.querySelector('#menu-close'),
  `activeElement=${document.activeElement?.id} (expected menu-close)`
);
await React.act(async () => keydown(document.querySelector('#menu-close'), 'Escape'));
check(
  'Escape closes the menu and restores trigger focus',
  !document.body.querySelector('[role="menu"]') && document.activeElement === menuTrigger,
  `menu present=${Boolean(document.body.querySelector('[role="menu"]'))}, focus restored=${document.activeElement === menuTrigger}`
);
await React.act(async () => {
  menuTrigger.focus();
  click(menuTrigger);
});
await React.act(async () => {
  document.getElementById('root').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
});
check(
  'pointerdown outside closes the menu',
  !document.body.querySelector('[role="menu"]'),
  `menu present=${Boolean(document.body.querySelector('[role="menu"]'))}`
);
await React.act(async () => {
  menuTrigger.focus();
  click(menuTrigger);
});
await React.act(async () => click(menuTrigger));
check(
  'the trigger toggles the menu closed',
  !document.body.querySelector('[role="menu"]'),
  `menu present=${Boolean(document.body.querySelector('[role="menu"]'))}`
);

// ── popover: open, honest ARIA, escape + outside close, focus restore ──
const popTrigger = container.querySelector('#popover-trigger');
await React.act(async () => {
  popTrigger.focus();
  click(popTrigger);
});
const pop = container.querySelector('[role="dialog"][aria-modal="false"]');
check(
  'click opens the non-modal popover with honest ARIA',
  Boolean(pop) &&
    pop.getAttribute('aria-label') === 'Filters' &&
    popTrigger.getAttribute('aria-expanded') === 'true' &&
    pop.contains(document.activeElement),
  `popover present=${Boolean(pop)}, aria-expanded=${popTrigger.getAttribute('aria-expanded')}, focused inside=${pop ? pop.contains(document.activeElement) : false}`
);
await React.act(async () => keydown(pop, 'Escape'));
check(
  'Escape closes the popover and restores trigger focus',
  !container.querySelector('[role="dialog"][aria-modal="false"]') && document.activeElement === popTrigger,
  `popover present=${Boolean(container.querySelector('[role="dialog"][aria-modal="false"]'))}, focus restored=${document.activeElement === popTrigger}`
);
await React.act(async () => click(popTrigger));
await React.act(async () => {
  container.querySelector('#tooltip-trigger').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
});
check(
  'pointerdown outside closes the popover',
  !container.querySelector('[role="dialog"][aria-modal="false"]'),
  `popover present=${Boolean(container.querySelector('[role="dialog"][aria-modal="false"]'))}`
);

// ── tooltip: hover + focus show, escape hide, leave/blur hide ──
const tipTrigger = container.querySelector('#tooltip-trigger');
await React.act(async () => {
  tipTrigger.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
});
let tip = container.querySelector('[role="tooltip"]');
check(
  'hover shows the tooltip and MERGES aria-describedby with any preset value',
  Boolean(tip) &&
    tipTrigger.getAttribute('aria-describedby') === `preset-desc ${tip.getAttribute('id')}`,
  `describedby=${tipTrigger.getAttribute('aria-describedby')} (expected "preset-desc" plus the tooltip id)`
);
await React.act(async () => {
  tipTrigger.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true }));
});
await React.act(async () => {
  tipTrigger.dispatchEvent(new dom.window.Event('focusin', { bubbles: true }));
});
tip = container.querySelector('[role="tooltip"]');
check(
  'keyboard focus shows the tooltip again',
  Boolean(tip),
  `tooltip present=${Boolean(tip)}`
);
await React.act(async () => keydown(tipTrigger, 'Escape'));
await React.act(async () => {
  tipTrigger.dispatchEvent(new dom.window.Event('focusout', { bubbles: true }));
});
check(
  'Escape hides the tooltip and removes only its own id from aria-describedby',
  !container.querySelector('[role="tooltip"]') && tipTrigger.getAttribute('aria-describedby') === 'preset-desc',
  `tooltip present=${Boolean(container.querySelector('[role="tooltip"]'))}, describedby=${tipTrigger.getAttribute('aria-describedby')}`
);

// ── listbox Select: combobox semantics, keyboard selection, typeahead, honesty ──
const lbTrigger = container.querySelector('#lb-trigger');
// the selected value is observed through the hidden form input the listbox renders
// for `name` — the same value a form submission would carry
const lbValue = () => container.querySelector('input[type="hidden"][name="tif"]')?.value;
const readLb = () => ({ expanded: lbTrigger.getAttribute('aria-expanded'), value: lbValue() });
const lbHidden = container.querySelector('input[type="hidden"][name="tif"]');
check(
  'listbox form association lands on the hidden input, not the trigger',
  lbHidden?.getAttribute('form') === 'external-form' && !lbTrigger.getAttribute('form'),
  `input form=${lbHidden?.getAttribute('form')}, trigger form=${lbTrigger.getAttribute('form')}`
);
await React.act(async () => {
  lbTrigger.focus();
  click(lbTrigger);
});
let lbPanel = container.querySelector('[role="listbox"]');
const lbOptions = lbPanel ? [...lbPanel.querySelectorAll('[role="option"]')] : [];
check(
  'click opens the listbox with combobox semantics and honest selection',
  Boolean(lbPanel) &&
    lbTrigger.getAttribute('aria-haspopup') === 'listbox' &&
    lbTrigger.getAttribute('aria-expanded') === 'true' &&
    lbOptions.length === 4 &&
    lbOptions.filter((o) => o.getAttribute('aria-selected') === 'true').length === 1,
  `panel=${Boolean(lbPanel)}, expanded=${readLb().expanded}, options=${lbOptions.length}`
);
check(
  'the listbox trigger keeps focus (aria-activedescendant pattern)',
  document.activeElement === lbTrigger,
  `activeElement=${document.activeElement?.id || document.activeElement?.tagName}`
);
await React.act(async () => {
  keydown(lbTrigger, 'ArrowDown');
  keydown(lbTrigger, 'ArrowDown');
});
const activeAfterArrow = lbTrigger.getAttribute('aria-activedescendant');
check(
  'ArrowDown moves the active option, skipping the disabled one',
  Boolean(activeAfterArrow) && !document.getElementById(activeAfterArrow).getAttribute('aria-disabled'),
  `activedescendant=${activeAfterArrow}, disabled=${document.getElementById(activeAfterArrow)?.getAttribute('aria-disabled')}`
);
await React.act(async () => keydown(lbTrigger, 'Enter'));
check(
  'Enter commits the active option with the native onChange shape',
  readLb().value === 'opg' && lbTrigger.getAttribute('aria-expanded') === 'false' && !container.querySelector('[role="listbox"]'),
  `value=${readLb().value}, expanded=${readLb().expanded}, panel closed=${!container.querySelector('[role="listbox"]')}`
);
await React.act(async () => click(lbTrigger));
await React.act(async () => keydown(lbTrigger, 'g'));
const typeaheadTarget = lbTrigger.getAttribute('aria-activedescendant');
check(
  'typeahead jumps to the matching option',
  typeaheadTarget && document.getElementById(typeaheadTarget)?.textContent === 'GTC',
  `activedescendant=${typeaheadTarget} (expected the GTC option)`
);
await React.act(async () => keydown(lbTrigger, 'Escape'));
check(
  'Escape closes the listbox without committing',
  lbTrigger.getAttribute('aria-expanded') === 'false' && readLb().value === 'opg',
  `expanded=${readLb().expanded}, value=${readLb().value}`
);
await React.act(async () => click(lbTrigger));
await React.act(async () => container.querySelectorAll('[role="option"]')[0].click());
check(
  'clicking an option selects it and closes the panel',
  readLb().value === 'day' && !container.querySelector('[role="listbox"]'),
  `value=${readLb().value}, panel closed=${!container.querySelector('[role="listbox"]')}`
);
await React.act(async () => click(lbTrigger));
await React.act(async () => {
  document.getElementById('root').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
});
check(
  'pointerdown outside closes the listbox',
  !container.querySelector('[role="listbox"]') && lbTrigger.getAttribute('aria-expanded') === 'false',
  `panel present=${Boolean(container.querySelector('[role="listbox"]'))}, expanded=${lbTrigger.getAttribute('aria-expanded')}`
);

// ── popover inside a dialog: one Escape closes only the innermost layer ──
await React.act(async () => click(container.querySelector('#open-dialog')));
const modal = document.body.querySelector('[role="dialog"][aria-modal="true"]');
await React.act(async () => click(modal.querySelector('#dialog-popover-trigger')));
const nestedPop = document.body.querySelector('[role="dialog"][aria-modal="false"]');
check(
  'a popover can open inside a modal dialog',
  Boolean(modal) && Boolean(nestedPop),
  `modal=${Boolean(modal)}, nested popover=${Boolean(nestedPop)}`
);
await React.act(async () => keydown(nestedPop, 'Escape'));
check(
  'Escape closes only the popover; the dialog stays open',
  !document.body.querySelector('[role="dialog"][aria-modal="false"]') &&
    Boolean(document.body.querySelector('[role="dialog"][aria-modal="true"]')),
  `nested popover present=${Boolean(document.body.querySelector('[role="dialog"][aria-modal="false"]'))}, modal present=${Boolean(document.body.querySelector('[role="dialog"][aria-modal="true"]'))}`
);
await React.act(async () => keydown(document, 'Escape'));
check(
  'the next Escape closes the dialog',
  !document.body.querySelector('[role="dialog"]'),
  `dialog present=${Boolean(document.body.querySelector('[role="dialog"]'))}`
);

// ════════════ baseline gate regression checks (Rule Zero) ════════════
{
  const tmp = resolve(root, 'node_modules', '.tmp-baseline-test');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const eng = ['chromium', 'firefox', 'webkit'];
  const vp = ['desktop', 'mobile'];

  const seedComplete = (platform) => {
    const p = resolve(tmp, platform);
    mkdirSync(p, { recursive: true });
    for (const e of eng) for (const v of vp) {
      writeFileSync(resolve(p, `${e}-${v}-dark.png`), 'x');
      writeFileSync(resolve(p, `${e}-${v}-light.png`), 'x');
    }
  };

  check('baseline gate: absent set is incomplete',
    baselineSetIsComplete(tmp, 'darwin') === false, 'missing directory');
  seedComplete('linux');
  rmSync(resolve(tmp, 'linux', 'webkit-mobile-dark.png'), { force: true });
  check('baseline gate: partial set is incomplete',
    baselineSetIsComplete(tmp, 'linux') === false, 'one missing PNG');
  writeFileSync(resolve(tmp, 'linux', 'webkit-mobile-dark.png'), 'x');
  check('baseline gate: complete set returns true',
    baselineSetIsComplete(tmp, 'linux') === true, 'full set');
  seedComplete('darwin');
  const r1 = resolveBaselinePlatform({ hostPlatform: 'darwin', baselinesDir: tmp, manifest: { latestPlatform: 'linux' } });
  check('baseline gate: host with own set gates on own', r1 === 'darwin', `got ${r1}`);
  rmSync(resolve(tmp, 'darwin'), { recursive: true, force: true });
  const r2 = resolveBaselinePlatform({ hostPlatform: 'darwin', baselinesDir: tmp, manifest: { latestPlatform: 'linux' } });
  check('baseline gate: absent host falls back to nominated', r2 === 'linux', `got ${r2}`);
  const r3 = resolveBaselinePlatform({ hostPlatform: 'darwin', baselinesDir: tmp, manifest: { latestPlatform: 'darwin' } });
  check('baseline gate: absent host + absent nominated → null', r3 === null, `got ${r3}`);
  const r4 = resolveBaselinePlatform({ hostPlatform: 'darwin', baselinesDir: tmp, manifest: null });
  check('baseline gate: no manifest → null', r4 === null, `got ${r4}`);

  rmSync(tmp, { recursive: true, force: true });
}

// ════════════ report ════════════
const passed = results.filter((r) => r.pass).length;
const report = {
  checkedAt: new Date().toISOString(),
  node: process.version,
  total: results.length,
  passed,
  failed: results.length - passed,
  sizes: { 'index.js': jsGz, 'index.cjs': cjsGz, 'ui.css': cssGz, unit: 'gzip bytes' },
  results
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.failed === 0 ? 0 : 1);
