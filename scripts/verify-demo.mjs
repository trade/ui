/**
 * @trade/ui — demo boot verification.
 * Loads the *built* demo (the real IIFE bundle) inside jsdom, lets it render,
 * then drives real interactions and asserts on the resulting DOM.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '..', 'apps', 'demo', 'dist');

const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const css = readFileSync(resolve(dist, 'ui.css'), 'utf8');
const js = readFileSync(resolve(dist, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

const page = html
  .replace(/<link rel="stylesheet" href="\.\/ui\.css" \/>/, () => `<style>${css}</style>`)
  .replace(/<script src="\.\/app\.js"><\/script>/, () => `<script>${js}</script>`);

const dom = new JSDOM(page, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/demo/' });
const { window } = dom;
const doc = window.document;
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const keydown = (el, key) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
const byText = (sel, text) => [...doc.querySelectorAll(sel)].find((el) => el.textContent.trim() === text);

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

await wait(300);

const root = doc.getElementById('root');
check('demo boots and mounts', Boolean(root && root.children.length > 0), `#root children=${root?.children.length ?? 0}`);

const bodyRows = doc.querySelectorAll('tbody tr[role="row"]');
check('watchlist renders', bodyRows.length >= 120, `body rows=${bodyRows.length}`);

const numericCells = doc.querySelectorAll('td .ui-cell--numeric, td.ui-cell--numeric');
check('numeric columns present', numericCells.length > 0, `numeric cells=${numericCells.length}`);

const glyphs = doc.body.textContent.includes('▲') && doc.body.textContent.includes('▼');
check('gain/loss glyphs rendered', glyphs, `up=${doc.body.textContent.includes('▲')}, down=${doc.body.textContent.includes('▼')}`);

const grid = doc.querySelector('[role="grid"]');
check('ARIA grid with row count', Boolean(grid) && grid.getAttribute('aria-rowcount') === '121', `aria-rowcount=${grid?.getAttribute('aria-rowcount')}`);

// interactions
click(byText('button', 'Dark'));
await wait();
check(
  'theme switch to dark applies to <html>',
  doc.documentElement.getAttribute('data-theme') === 'dark',
  `data-theme=${doc.documentElement.getAttribute('data-theme')}`
);

click(byText('button', 'Light'));
await wait();
check('theme switch back to light', doc.documentElement.getAttribute('data-theme') === 'light', `data-theme=${doc.documentElement.getAttribute('data-theme')}`);

// tabs
const tabs = doc.querySelectorAll('[role="tab"]');
click(tabs[2]);
await wait();
const selected = [...doc.querySelectorAll('[role="tab"]')].findIndex((t) => t.getAttribute('aria-selected') === 'true');
check('tab click switches panel', selected === 2, `selectedIndex=${selected}`);

// dialog via row click
click(bodyRows[0]);
await wait();
const dialog = doc.body.querySelector('[role="dialog"]');
check('row click opens the order ticket', Boolean(dialog), `dialog present=${Boolean(dialog)}, title=${dialog?.querySelector('.ui-dialog__title')?.textContent ?? '-'}`);

keydown(doc, 'Escape');
await wait();
check('Escape dismisses the ticket', !doc.body.querySelector('[role="dialog"]'), `still open=${Boolean(doc.body.querySelector('[role="dialog"]'))}`);

const passed = results.filter((r) => r.pass).length;
const report = {
  checkedAt: new Date().toISOString(),
  total: results.length,
  passed,
  failed: results.length - passed,
  results
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.failed === 0 ? 0 : 1);
