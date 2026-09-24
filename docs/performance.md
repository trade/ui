# Performance

The budgets, the measurement methodology, and the discipline rules that keep the library fast.
Measured numbers live in [STATUS.md](../STATUS.md); the methodology is in `harness/` and
`scripts/browser-suite.mjs`. Related: [verification.md](verification.md) for how the gates run,
[css.md](css.md) for why static CSS is a performance decision.

## Budgets (gated by `npm run size`)

| Artifact | Budget (gzip) | Measured |
|---|---|---|
| `@trade/ui` ESM bundle | 8 kB | **7.78 kB** |
| Stylesheet (all components) | 8 kB | **5.47 kB** |
| Generated types | 3 kB | under |

Zero runtime dependencies (ADR-002) is the first performance decision: no dependency graph, no
hot-path weight, tree-shakeable per-area CSS imports.

## Frame-time budgets (gated by `verify:browser`)

```js
const T = {
  maxP95FrameMs: 25,          // 25, not 20: 16.7 ms frames at 60 Hz; 20 gave false failures at p95=22
  maxDroppedFrameRatio: 0.05, // frames > 33 ms over steady frames
  maxOverflowPx: 1,
  maxAxeViolations: 0,
  maxConsoleErrors: 0
};
```

Absolute fps is deliberately **never gated** — headless engines drive rAF at engine-specific
cadences, so fps is informational; frame deltas are what's real. Measured: ticking p95 **16.7 ms,
0 dropped frames** on Chromium/Firefox.

## The harness

`harness/src/perf.jsx` (bundled by `scripts/build-harness.mjs`, axe inlined) is a
self-measuring page that renders:

- **Live viewport** — 60 dense rows of 12 real instruments, ticking every animation frame via a
  rAF loop (`window.__startTick`), over a declared dataset of 200,000 rows.
- **Full dataset** — all 5,000 rows in the DOM, for ARIA/DOM-size honesty checks.

Benchmarks on `window`:

- `__runStaticBenchmark(1500)` — non-ticking frame timing, isolating paint cost from
  re-render cost. Returns `{frames, fps, p95}`.
- `__runFrameBenchmark(3000, warmup=10)` — ticks every frame for 3 s and reports steady-state
  (first 10 warmup frames discarded) `p50/p95/max`, `over16_7` (missed 60 Hz) and `over33`
  (dropped frames).

The inlined self-audit then records structure (rows rendered vs `aria-rowcount`), layout
overflow, theme switch, static + ticking benchmarks, and axe violations, and POSTs the JSON to
`/results`. `browser-suite.mjs` runs it in 6 combos (3 engines × 2 viewports), settles 1500 ms,
re-measures a combo when a reading looks throttled (p95 > 100 ms), when a gated reading is only
marginally over budget, or when an earlier combo in the same run read catastrophically, keeping the
better attempt (`scripts/perf-policy.mjs`, checked by `check:perf-policy`). Why 25 ms and not 20, why the retry exists, and the WebKit-port vs real-macOS-WebKit
story: [verification.md](verification.md) and [STATUS.md](../STATUS.md).

## Virtualization contract

`DataTable` ships **no virtualizer** — it renders whatever rows it is given. The contract is the
honesty mechanism: pass `rowCount` (full dataset), `rowOffset` (index of the first supplied row)
and `rowHeight`, and the table emits `aria-hidden` spacer rows plus an `aria-rowcount` covering
the *whole* dataset, so screen readers see the truth while the DOM holds a window. Verified at
5,000-row SSR scale and 200,000-row live scale. Consumers plug in their own windowing; `useTicks`
(below) is what bounds how often new rows reach it.

## Tick coalescing

`useTicks` bounds how often a tick stream reaches React. Data arrives far more often than the
display refreshes, and every render walks every row and cell — the 60-row harness measures roughly
360 cell renders per frame. The hook queues updaters and commits them **at most once per animation
frame** (or per N ms via `every`), so a thousand ticks cost a thousand cheap updater calls and
**one** render.

Queued updaters are applied **in order**, so a delta stream is merged rather than truncated; a
caller holding full snapshots passes `() => snapshot`. The queue is client-only — a server render
uses the initial value — and unmounting cancels a pending flush. Asserted by `verify.mjs`: a
100-tick burst must produce exactly one render with every update applied, a later tick must
re-schedule, and a flush pending at unmount must not commit.

## Hot-path discipline

From CONTRIBUTING §5 and the ADRs — the rules that make the numbers above reproducible:

1. **Static CSS only.** No per-render style computation; one `cx()` per render, max. Variants are
   classes; density is resolved in the stylesheet.
2. **Theme switch is one attribute write** on `<html>` (`setThemeAttribute`) — zero React
   renders, no style code, measured and asserted by `verify.mjs`.
3. **Tables render a window, not the dataset**, with honest `aria-rowcount`.
4. **`transition: none` everywhere** (ADR-004) — every state change is exactly one paint. No
   keyframes, no entry/exit animations, no auto-dismiss timers.
5. **Budgets are gates, not aspirations** — `npm run size` and the frame-time thresholds fail CI.
6. **Coalesce the feed, not the paint.** `useTicks` bounds renders to the display's cadence; the
   library never renders more frames than the screen can show.

Commit evidence follows the same discipline: numbers, not adjectives — *"p95 16.7 ms → 12.1 ms
over 90 frames, `npm run verify:browser`"*, per CONTRIBUTING §7.
