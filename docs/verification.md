# Verification

Every rule in this repo that can be executed **is** executed. This page enumerates the gates, what
each checks, and how to extend them. Wire-up lives in `package.json` and
`.github/workflows/ci.yml`. Rule zero: when you add a convention, add its check in the same
change — a rule without a gate rots. Ungateable rules go in [STATUS.md](../STATUS.md) as known
gaps.

## The suites

### `scripts/verify.mjs` — 70 library checks

Two phases, exits non-zero on any failure, prints a JSON report.

- **Phase A — static:** package contract (zero runtime deps, React peer, `sideEffects:
  false`, exports map); build artifacts present (4 artifacts, ≥7 per-component CSS files);
  generated CSS health (≥60 `--ui-*` properties, no non-`none` transitions, identical token names
  across themes, every role references a primitive, ≥30 `--ui-ref-*`, high-contrast present);
  gzip sizes within budget; SSR markup (ARIA grid with honest `aria-rowcount`, dense table
  numeric cells, ▲/▼ glyphs, tablist/modal semantics, no inline transitions); scale (5,000 rows
  SSR'd with `aria-rowcount` for 200,000).
- **Phase B — jsdom interaction:** tab click + ArrowRight roving tabindex; dialog
  open/focus + Escape; theme switch sets `data-theme` on `<html>` with **zero React renders**;
  `useTheme().resolved` follows the OS; selection-control semantics and `onChange`; live-region
  semantics; Home/End jumps; focus trap wrapping in both directions.

### `scripts/verify-example.mjs` — 10 checks

Boots the **built demo bundle** (IIFE, `runScripts: 'dangerously'`) in jsdom: mount, 120-row
watchlist, numeric columns, direction glyphs, `aria-rowcount="121"`, theme switch to dark and
back, tab click, row-click opens the order ticket, Escape dismisses.

### `scripts/browser-suite.mjs` — 14 checks × 6 combos = 84 (78 in update mode)

Playwright, engines `{chromium, firefox, webkit}` × viewports `{desktop 1600×900, mobile
390×844}`, against the self-measuring harness served on `127.0.0.1:4174` (see
[performance.md](performance.md)). Per combo: no horizontal overflow (≤1 px); theme switch works;
ARIA row count preserved; **axe = 0 violations in light and in dark**; no console errors / ≥400
responses; axe ran; steady-state frame p95 ≤ 25 ms; dropped-frame ratio ≤ 5%; static p95
≤ 25 ms; sticky header pinned (scroll 400 px, header offset < 8 px); fps reported
informationally. Thresholds live in one `T` object — `maxP95FrameMs: 25` (not 20: 20 gave false
failures at p95 = 22). A combo is re-measured when a reading looks throttled (p95 > 100 ms), when a gated reading is only
marginally over budget, or when an earlier combo in the same run read catastrophically (the host is
thrashing), keeping the better attempt — runner noise must not fail real regressions, but it
also must not mask them. The rules live in `scripts/perf-policy.mjs`; every branch is exercised by
`npm run check:perf-policy`, which also pins the 25 ms budget so it cannot be loosened silently.

**Engine-conditional gating** (the measured-reliability rule): on non-macOS, the Playwright
WebKit *port's* perf numbers are informational (functional checks still gate); real WebKit is
gated by the dedicated `browser-macos` CI job on `macos-latest`. On macOS runners the reverse —
only real WebKit's perf gates, because shared-runner Chromium read a hardware-impossible 50 ms
static p95. Full story: [STATUS.md](../STATUS.md), gh run 35205539648.

### `scripts/check-contract.mjs` — 12 checks

The package promises: zero runtime dependencies in `@trade/ui` **and** `@trade/tokens`; React and
React DOM are peers, not deps; `sideEffects: false`; exports map exposes import/require/types and
`./styles.css`; publishes only `dist`; all 4 build artifacts present and non-empty.

### `scripts/check-contrast.mjs` — 23 pairs × 3 themes = 69

WCAG 1.4.3 AA (4.5:1) for text roles, 1.4.11 (3.0:1) for UI boundaries, evaluated over the token
system per theme — before any browser runs. See [design-tokens.md](design-tokens.md). Extend
`PAIRS` when you add a foreground/background combination.

### `scripts/check-style.mjs` — 128 checks over 11 library + 2 app stylesheets

The CSS authoring contract — raw values, physical direction, z-index, shadows, motion,
`!important`, font-size, namespacing, vendor prefixes. Enumerated in [css.md](css.md).

### `npm run size`

size-limit budgets: ESM bundle ≤ 8 kB gzip, stylesheet ≤ 8 kB gzip, types ≤ 3 kB. Measured today:
7.78 / 5.47 kB (types 485 B) — under budget, with the ESM number down to ~0.2 kB of headroom,
so the next component is a size conversation, not a shrug.

## CI and the local loop

`npm run ci` = `check:contract → build → check:contrast → check:style → check:types →
check:docs → check:perf-policy → check:commits → example:build → example-trading:build →
harness:build → size → verify → verify:example → verify:example-trading → verify:browser`,
all non-zero-exit. CI (.github/workflows/ci.yml,
Node 22) runs four jobs: **build** (the static checks + dist artifact), **size**, **verification**
(verify + both examples + all three browser engines; uploads `verification/` evidence even on failure),
**browser-macos** (real WebKit perf gating). Every command exits non-zero on failure; a non-zero
exit means the work is wrong, not that the command is flaky.

## Adding checks

- New library behaviour (keyboard, ARIA, disabled) → `scripts/verify.mjs`; render it in
  `scripts/sample-screen.mjs` so it also flows through the browser suites.
- Example-level behaviour → `scripts/verify-example.mjs`.
- New token pair → `check-contrast.mjs` `PAIRS`. New CSS convention → `check-style.mjs`.
- New package promise → `check-contract.mjs`. Gate policy → `scripts/perf-policy.mjs` + `check-perf-policy.mjs`.

Never weaken a gate to make a change pass (AGENTS.md invariant 9 — the one unrecoverable
mistake). If a check fails, the change is wrong or the check is wrong; fix one of those two
things, in the open.
