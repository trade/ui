# Verification

Every rule in this repo that can be executed **is** executed. This page enumerates the gates, what
each checks, and how to extend them. Wire-up lives in `package.json` and
`.github/workflows/ci.yml`. Rule zero: when you add a convention, add its check in the same
change — a rule without a gate rots. Ungateable rules go in [STATUS.md](../STATUS.md) as known
gaps.

## The suites

### `scripts/verify.mjs` — 68 library checks

Two phases, exits non-zero on any failure, prints a JSON report. It deliberately does **not**
re-assert the package promises (that is `check-contract.mjs`) or the baseline-gate resolution (that
is `tests/baseline-gate.test.mjs`) — one owner per rule, so a regression is reported once.

- **Phase A — static:** build artifacts present (4 artifacts, ≥7 per-component CSS files);
  generated CSS health (≥60 `--ui-*` properties, no non-`none` transitions, identical token names
  across themes, every role references a primitive, ≥30 `--ui-ref-*`, high-contrast present);
  gzip sizes within budget; SSR markup (ARIA grid with honest `aria-rowcount`, dense table
  numeric cells, ▲/▼ glyphs, tablist/modal semantics, no inline transitions); scale (5,000 rows
  SSR'd with `aria-rowcount` for 200,000).
- **Phase B — jsdom interaction:** tab click + ArrowRight roving tabindex; dialog
  open/focus + Escape; theme switch sets `data-theme` on `<html>` with **zero React renders**;
  `useTheme().resolved` follows the OS; selection-control semantics and `onChange`; live-region
  semantics; Home/End jumps; focus trap wrapping in both directions; `useTicks` coalescing — a
  100-tick burst commits as one render with every update applied, a cadence change re-arms a
  pending flush, and unmount cancels one.

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

### Running the browser suite in CI's container (`npm run verify:browser:docker`)

Playwright supports **macOS 14 and later**. A development host below that floor cannot run the
suite at all (Chromium's binary requires macOS 13+, and the WebKit build is macOS-14-targeted), and
even a host that can run it renders differently from the Linux container that produced
`baselines/linux`. `scripts/verify-browser-docker.mjs` removes both problems: it runs `npm ci`,
`build`, `harness:build` and the suite **inside the same digest-pinned image CI uses** — read from
`.github/workflows/ci.yml`, so the two can never drift — with the same `--shm-size=1g` and `HOME`.
`node_modules` lives in the named volume `ui-node-modules`, so the host checkout is never written to.

```powershell
npm run verify:browser:docker                 # compare against baselines/linux
npm run verify:browser:docker -- --update-baselines
```

**Give the container resources.** On a Docker VM with 2 CPUs the perf gates (p95 ≤ 25 ms) fail on
throttling, not on the change: the suite reports every combo `[STILL THROTTLED]` and webkit — whose
perf is informational off macOS — is the only combo that should pass clean. Raise Docker Desktop to
4 CPUs / 8 GB for a faithful run.

### `scripts/check-contract.mjs` — 12 checks

The package promises: zero runtime dependencies in `@trade/ui` **and** `@trade/tokens`; React and
React DOM are peers, not deps; `sideEffects: false`; exports map exposes import/require/types and
`./styles.css`; publishes `dist` plus the licence files (`LICENSE`, `LICENSE-MIT`, `LICENSE-APACHE`,
`NOTICE`) and nothing else; all 4 build artifacts present and non-empty.

### `scripts/check-contrast.mjs` — 23 pairs × 3 themes = 69

WCAG 1.4.3 AA (4.5:1) for text roles, 1.4.11 (3.0:1) for UI boundaries, evaluated over the token
system per theme — before any browser runs. See [design-tokens.md](design-tokens.md). Extend
`PAIRS` when you add a foreground/background combination.

### `scripts/check-style.mjs` — 141 checks over 11 library + 2 app stylesheets

The CSS authoring contract — raw values, physical direction, z-index, shadows, motion,
`!important`, font-size, namespacing, vendor prefixes. Enumerated in [css.md](css.md).

### `tests/*.test.mjs` — `npm test` (node:test, no dependencies)

The unit-level floor for the pure modules — the parts that have no browser and no DOM:

- `tests/perf-policy.test.mjs` — the browser suite's retry policy: the pinned 25 ms budget and 5 ms
  slack, per-platform engine gating, the inclusive budget boundary, throttle detection, and the
  verdict/retry branches.
- `tests/baseline-gate.test.mjs` — baseline-set resolution: a host gates only on a complete set, an
  absent host falls back to the manifest's nominated complete set, otherwise the checks are
  informational.
- `tests/tokens.test.mjs` — the ADR-001 token contract: identical role sets across themes, every role
  a primitive reference, every reference resolving, the frozen scales (9-step space, density
  `1 / 0.75 / 0.625`, motion off).

These use `node:test` — no dependency, matching ADR-002. The behavioural suites (`verify.mjs`, the
browser suite) still own rendered behaviour; this only covers the pure logic beneath them.

### `scripts/check-license.mjs` — `npm run check:license`

The project is dual-licensed **MIT OR Apache-2.0**. This gate asserts that the terms travel with
the code: the licence files exist (`LICENSE`, `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`), every
package manifest declares `"MIT OR Apache-2.0"`, and every source file carries an
`SPDX-License-Identifier` header. Non-headerable files (JSON, HTML, the committed baseline PNGs)
are covered by `REUSE.toml` (REUSE Specification 3.0).

### `npm run size`

`npm run size` measures **what a consumer actually ships** — bundled, minified and gzipped — via the
`@size-limit/esbuild` provider. (The previous `@size-limit/file` entries only gzipped the committed,
unminified artifact, which overstated every number by roughly a quarter and made the ESM budget look
almost exhausted.) **Four budgets:**

| Entry | Budget | Measured |
|---|---|---|
| ESM, full surface | 7 kB | 5.89 kB |
| ESM, `Button` only — tree-shaking guard | 1.5 kB | 620 B |
| CJS, full surface | 7.5 kB | 6.36 kB |
| Stylesheet (all components) | 8 kB | 3.72 kB |

These bound the **minified** cost, not the published files. The committed artifacts are deliberately
unminified and therefore larger — `dist/index.js` ≈ 7.8 kB, `dist/index.cjs` ≈ 8.2 kB, `dist/ui.css`
≈ 6.2 kB, `dist/index.d.ts` ≈ 0.5 kB gzipped — so a 7.5 kB size-limit entry does **not** mean the
published `index.cjs` is under 7.5 kB; it means a consumer who bundles and minifies it pays 6.36 kB.

`verify.mjs` bounds the published files instead, with a separate tripwire (gzip < 12 / 12 / 8 / 3 kB for
`index.js` / `index.cjs` / `ui.css` / `index.d.ts`), so a regression in the shipped artifacts is caught
even if the minifier's output shifts. The generated-types budget lives there because size-limit cannot
bundle a `.d.ts`.

## CI and the local loop

`npm run ci` = `check:contract → build → check:contrast → check:style → check:types → test →
check:license → check:docs → check:perf-policy → check:commits → example:build → example-trading:build →
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
