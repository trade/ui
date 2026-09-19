# Status

Where this project stands, so anyone — human or a fresh agent session with no memory of how it got
here — can pick it up without re-deriving anything.

- **What it is / how to use it:** `README.md`
- **Why the architecture is the way it is:** `DECISIONS.md`
- **How to change it safely (rules + gates):** `CONTRIBUTING.md`; agents use `AGENTS.md` (invariants, context router, verification ladder)
- **Verification and CI:** `README.md` § Verification & CI

---

## Current state

A working, verified component library. Not yet used by a real application.

| Package | Purpose | State |
|---|---|---|
| `@trade/tokens` | primitives → theme roles, compiled to static CSS + typed TS | done |
| `@trade/ui` | 12 components, static CSS, 3 themes, no animation | done |
| `apps/example` | watchlist + order ticket component reference | done |
| `apps/example-trading` | production-grade trading workspace example | done |
| `harness/` + `scripts/` | self-measuring browser harness, verification suites | done |

**Components:** Button, Input, Select, Field, Checkbox/Radio/Switch, DataTable + Cell, Tabs, Menu, Dialog,
Banner/Toast, ThemeProvider, Stack.

**Themes:** light, dark, high-contrast. A theme is a role→primitive mapping; adding one requires no
component change.

| Measured | Value |
|---|---|
| Runtime dependencies | **0** (React/React DOM are peers) |
| ESM bundle | **5.19 kB** gzip (budget 8 kB) |
| Stylesheet | **4.82 kB** gzip (budget 8 kB) |
| Theme switch cost | **0 React renders** |
| Ticking frame time, Chromium/Firefox | **p95 16.7 ms**, 0 dropped frames |
| Ticking frame time, WebKit | **gates pass on real macOS WebKit**; the 26–36 ms seen on the Playwright port was a port artifact (resolved 2026-09-17) |
| axe (light + dark, 3 engines) | **0 violations** |
| Contrast contract | **69/69 pairs** across 3 themes |

## Verify it

```powershell
npm run ci        # contract + build + contrast + demo + harness + size + all three suites
```

Individual: `npm run check:contract` · `check:contrast` · `verify` · `verify:example` · `verify:browser`
· `size`. Every one exits non-zero on failure.

## Known issues

1. ~~**WebKit ticking performance.**~~ **Resolved 2026-09-17; re-verified on this repo.** The
   `browser-macos` CI job passed
   ([gh run 35321214702](https://github.com/trade/ui/actions/runs/35321214702)): real macOS
   WebKit **passes every perf gate** (12/12 on desktop and mobile). The slow ticking was a
   Playwright-port artifact, not a Safari bug. The mirror problem remains — Chromium on the shared
   macOS runner cannot hold the perf gates (static p95 read 50 ms, which no real hardware
   produces) — so on macOS only WebKit's perf gates and other engines' perf is informational.
2. ~~**No visual regression.**~~ **Resolved 2026-09-18 (capture made deterministic, ADR-005).**
   The browser suite pixel-compares every screenshot (3 engines × 2 viewports × 2 themes) against
   the committed, read-only `baselines/<platform>/` directory and fails on a diff above 0.3% of
   pixels. First round (PRs #8/#9) calibrated the threshold against same-host noise (< 0.21%) and
   still flaked cross-host: CI failed webkit-mobile at 0.574% and a local win32 run failed
   firefox-mobile at 0.389% with zero structural pixels differing — the screenshots contained a
   wall-clock header, live perf figures and tick-drifted prices. The harness now freezes the
   capture (`__freezeForCapture`: feed stopped, table reset to its canonical state, volatile audit
   lines rewritten in the DOM; the suite parses exact numbers from the log and hard-fails when the
   harness cannot prove it froze). Evidence: two consecutive runs 84/84 each with **0 differing
   pixels** across all 12 captures. Regeneration is the explicit `npm run baselines:update` or the
   CI `baselines` job (workflow_dispatch — regenerates in the exact verify container; the artifact
   is reviewed, then committed by hand). Baselines exist for win32 and linux, so visual checks gate
   locally **and in the ubuntu CI job**; macOS gates on `baselines/darwin/` (see item 2).
2. ~~**No macOS baseline set.**~~ **Resolved 2026-09-19.** The `baselines-macos` CI job
   (workflow_dispatch) regenerated the full 12-PNG `baselines/darwin/` set on a real macOS
   runner ([run 35458736319](https://github.com/trade/ui/actions/runs/35458736319)), the
   artifact was reviewed and committed by hand with the matching `manifest.json` entry.
   `latestPlatform: darwin` is now backed by a complete set, so the `browser-macos` job
   gates for real (a nominated-but-absent platform can never gate — see item 4).
3. **No secrets scanning.** Only keyword matching was done; the project carries no credentials.
4. ~~**MacOS visual gate blocked on missing `baselines/darwin/` PNGs.**~~ **Resolved
   2026-09-19.** The structural hole in `scripts/browser-suite.mjs` (a platform gated whenever
   `manifest.latestPlatform` named it, PNGs or not — the opposite of the suite's contract) was
   fixed by `baselineSetIsComplete()`, which requires the PNGs to actually be present, and the
   `baselines/darwin/` set itself is now committed (item 2), so macOS visual checks gate
   instead of passing informationally.
5. **`baselines/win32/` is committed but never exercised in CI.** No Windows job generates or
   compares against it; the linux job gates and macOS will gate once PNGs land. Either add a
   Windows job or mark win32 as legacy.
6. **Ungated by design** (recorded per Rule zero): commit-message *bodies* (subjects are gated by
   `check:commits`; evidence-in-body is not machine-checkable); inline `style={{ }}` props in app
   JSX (app stylesheets are gated by `check:style`; inline JSX styles are convention only); the
   harness page's own inline styles (instrument chrome, generated by `build-harness.mjs`).

## Not started

- Phase 2 components: `Popover`, `Tooltip`, and a listbox `Select` (currently native
  `<select>`-backed on purpose).
- Tick coalescing helper (`useTicks`).

## Next, in order

1. ~~Generate an **ubuntu baseline set** so the visual gate hard-fails in CI.~~ Done 2026-09-18 —
   `baselines/linux/` regenerated in the digest-pinned `mcr.microsoft.com/playwright` container;
   the new CI `baselines` job (workflow_dispatch) regenerates the set in the exact verify
   environment from now on. **CI validation complete 2026-09-19** — the ubuntu `verify` job
   (which pixel-compares against `baselines/linux/`) passed on every dependency-bump PR
   (#11–#16) merged that day.
2. ~~A macOS baseline set (real WebKit) for the `browser-macos` job.~~ Done 2026-09-19.
3. Phase 2 components.

A fuller optimisation roadmap (density, theme splitting, component tokens, icons, motion, publishing)
was produced during the build; the items above are the ones that block or de-risk the others.

## Settled architecture

The frozen token scale, the zero-dependency rule, static CSS with attribute theming, and motion
off by default are all recorded with their reasoning in `DECISIONS.md`. Treat them as settled.
