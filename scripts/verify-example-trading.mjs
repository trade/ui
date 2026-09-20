#!/usr/bin/env node
/**
 * Verify the trading workspace screen: it must actually render, stay accessible, and be
 * measurably denser than the old layout. This is a design check as much as a code check.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { EXPECTED_COUNTS } from './expected-counts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(root, 'apps', 'example-trading', 'dist');
const shots = resolve(root, 'verification', 'screen');
mkdirSync(shots, { recursive: true });

if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('apps/example-trading/dist missing — run npm run example-trading:build');
  process.exit(1);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const PORT = 4176;
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = join(dist, normalize(rel));
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

const browser = await chromium.launch();

for (const vp of [{ name: 'desktop', width: 1600, height: 900 }, { name: 'narrow', width: 900, height: 700 }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  // axe is injected here rather than shipped in the screen's HTML
  await page.addScriptTag({ path: resolve(root, 'node_modules', 'axe-core', 'axe.min.js') });
  await page.waitForTimeout(900);

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body.getBoundingClientRect();
    const grid = document.querySelector('[role="grid"]');
    const rows = document.querySelectorAll('tbody tr[role="row"]');
    const wrap = document.querySelector('.ui-table-wrap');
    const toPx = (v) => parseFloat(v) || 0;
    const style = getComputedStyle(document.body);
    return {
      scrolls: de.scrollHeight - de.clientHeight,
      bodyHeight: Math.round(body.height),
      domRows: rows.length,
      ariaRowcount: grid ? grid.getAttribute('aria-rowcount') : null,
      ariaRowindexFirst: rows[0] ? rows[0].getAttribute('aria-rowindex') : null,
      wrapClientHeight: wrap ? wrap.clientHeight : 0,
      wrapScrollHeight: wrap ? wrap.scrollHeight : 0,
      fontSize: style.fontSize,
      hasOverflowX: de.scrollWidth - de.clientWidth
    };
  });

  const rowHeight = 23;
  const visibleRows = Math.round(m.wrapClientHeight / rowHeight);
  check(`${vp.name}: page itself does not scroll (content fills the viewport)`, Math.abs(m.scrolls) <= 1, `scrollHeight-clientHeight=${m.scrolls}px, body=${m.bodyHeight}px`);
  check(`${vp.name}: no horizontal overflow`, Math.abs(m.hasOverflowX) <= 1, `overflow=${m.hasOverflowX}px`);
  check(`${vp.name}: watchlist is virtualized`, m.domRows > 0 && m.domRows < 80 && m.ariaRowcount === '5001', `dom rows=${m.domRows}, aria-rowcount=${m.ariaRowcount}`);
  check(`${vp.name}: ARIA row index accounts for the window offset`, Number(m.ariaRowindexFirst) >= 2, `first aria-rowindex=${m.ariaRowindexFirst}`);
  check(`${vp.name}: dense row rhythm`, visibleRows >= 14, `~${visibleRows} rows fit in ${m.wrapClientHeight}px (${rowHeight}px rows)`);
  check(`${vp.name}: base type is 12px, not 14px+`, m.fontSize === '12px', `body font-size=${m.fontSize}`);

  // scroll deep into the dataset: the window must move and the header must stay pinned.
  // Reading the DOM in the same evaluate as the scroll would race React's re-render.
  await page.evaluate(() => {
    document.querySelector('.ui-table-wrap').scrollTop = 1200 * 23;
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const wrap = document.querySelector('.ui-table-wrap');
    const rows = document.querySelectorAll('tbody tr[role="row"]');
    const th = wrap.querySelector('thead th');
    const wr = wrap.getBoundingClientRect();
    return {
      firstRowIndex: rows[0] ? Number(rows[0].getAttribute('aria-rowindex')) : null,
      symbol: rows[0] ? rows[0].querySelector('td').textContent : null,
      headerPinned: th ? Math.abs(th.getBoundingClientRect().top - wr.top) < 8 : false,
      scrollTop: Math.round(wrap.scrollTop)
    };
  });
  check(`${vp.name}: windowing moves with the scroll`, (after.firstRowIndex ?? 0) > 1000, `scrolled to row ${after.firstRowIndex} (${after.symbol})`);
  check(`${vp.name}: sticky header holds while scrolled`, after.headerPinned, `scrollTop=${after.scrollTop}, pinned=${after.headerPinned}`);

  // themes
  const themes = await page.evaluate(async () => {
    const out = [];
    for (const b of document.querySelectorAll('.top button')) {
      const label = b.textContent.trim();
      if (['Light', 'Dark', 'Contrast'].includes(label)) {
        b.click();
        await new Promise((r) => setTimeout(r, 60));
        out.push(`${label}->${document.documentElement.getAttribute('data-theme')}`);
      }
    }
    return out;
  });
  check(`${vp.name}: all three themes apply`, themes.join(' ') === 'Light->light Dark->dark Contrast->high-contrast', themes.join(' '));

  // ticket guard: an order above buying power must warn inline and must not be submittable.
  // React ignores direct .value writes, so set it through the native setter + input event.
  const guard = await page.evaluate(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const qty = document.querySelector('#tk-qty');
    const setQty = async (v) => {
      setter.call(qty, v);
      qty.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 150));
    };
    await setQty('100000');
    const warned = Boolean(document.querySelector('.ticket__warn'));
    const buy = [...document.querySelectorAll('.ticket__actions button')]
      .find((b) => /^(Buy|Sell) \d/.test(b.textContent.trim()));
    const submitDisabled = buy ? buy.disabled : null;
    await setQty('100');
    const warnGone = !document.querySelector('.ticket__warn');
    // Reset must restore the WHOLE ticket: side back to buy, defaults back in the inputs
    document.querySelector(".side button[data-side='sell']").click();
    await new Promise((r) => setTimeout(r, 120));
    [...document.querySelectorAll('.ticket__actions button')]
      .find((b) => b.textContent.trim() === 'Reset').click();
    await new Promise((r) => setTimeout(r, 150));
    const sideRestored = document.querySelector(".side button[data-side='buy']")
      .getAttribute('aria-pressed') === 'true';
    const qtyRestored = document.querySelector('#tk-qty').value === '100';
    return { warned, submitDisabled, warnGone, sideRestored, qtyRestored };
  });
  check(
    `${vp.name}: ticket warns and disables submit above buying power`,
    guard.warned && guard.submitDisabled === true && guard.warnGone,
    `warn=${guard.warned}, submitDisabled=${guard.submitDisabled}, clears when affordable=${guard.warnGone}`
  );
  check(
    `${vp.name}: Reset restores side and defaults`,
    guard.sideRestored === true && guard.qtyRestored === true,
    `sideRestored=${guard.sideRestored}, qtyRestored=${guard.qtyRestored}`
  );

  // accessibility, light then dark
  await page.evaluate(() => { for (const b of document.querySelectorAll('.top button')) if (b.textContent.trim() === 'Light') b.click(); });
  await page.waitForTimeout(200);
  const lightDetail = await page.evaluate(async () => {
    const v = (await window.axe.run(document, { resultTypes: ['violations'] })).violations;
    return v.map((x) => `${x.id}×${x.nodes.length} [${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}]`).join('; ');
  });
  const light = lightDetail ? lightDetail.split('; ') : [];
  await page.evaluate(() => { for (const b of document.querySelectorAll('.top button')) if (b.textContent.trim() === 'Dark') b.click(); });
  await page.waitForTimeout(200);
  const darkDetail = await page.evaluate(async () => {
    const v = (await window.axe.run(document, { resultTypes: ['violations'] })).violations;
    return v.map((x) => `${x.id}×${x.nodes.length} [${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}]`).join('; ');
  });
  const dark = darkDetail ? darkDetail.split('; ') : [];

  check(`${vp.name}: axe clean (light)`, light.length === 0, light.length ? lightDetail : '0 violations');
  check(`${vp.name}: axe clean (dark)`, dark.length === 0, dark.length ? darkDetail : '0 violations');
  check(`${vp.name}: no console errors`, consoleErrors.length === 0, `${consoleErrors.length}${consoleErrors.length ? ': ' + consoleErrors[0].slice(0, 120) : ''}`);

  await page.screenshot({ path: resolve(shots, `${vp.name}-dark.png`) });
  await page.evaluate(() => { for (const b of document.querySelectorAll('.top button')) if (b.textContent.trim() === 'Light') b.click(); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(shots, `${vp.name}-light.png`) });

  await page.close();
}

await browser.close();
server.close();

if (results.length !== EXPECTED_COUNTS.trading) {
  console.error(
    `trading suite: ${results.length} checks ran but scripts/expected-counts.mjs declares ${EXPECTED_COUNTS.trading}. `
    + 'Update that number and the docs it feeds in the same change, then run check:docs.'
  );
  process.exit(1);
}
const passed = results.filter((r) => r.pass).length;
const report = { checkedAt: new Date().toISOString(), total: results.length, passed, failed: results.length - passed, results };
writeFileSync(resolve(root, 'verification', 'screen-report.json'), JSON.stringify(report, null, 2), 'utf8');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  — ${r.detail}`);
console.log(`\nTOTAL: ${passed}/${results.length}`);
process.exit(report.failed === 0 ? 0 : 1);
