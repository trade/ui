# Status

Where this project stands, so anyone — human or a fresh agent session with no memory of how it got
here — can pick it up without re-deriving anything.

- **What it is / how to use it:** `README.md`
- **Why the architecture is the way it is:** `DECISIONS.md`
- **How to change it safely (rules + gates):** `CONTRIBUTING.md`, and `AGENTS.md` for agents
- **Verification and CI:** `README.md` § Verification & CI

---

## Current state

A working, verified component library. Not yet used by a real application.

| Package | Purpose | State |
|---|---|---|
| `@trade/tokens` | primitives → theme roles, compiled to static CSS + typed TS | done |
| `@trade/ui` | 11 components, static CSS, 3 themes, no animation | done |
| `apps/demo` | watchlist + order ticket reference screen | done |
| `harness/` + `scripts/` | self-measuring browser harness, verification suites | done |

**Components:** Button, Input, Select, Field, Checkbox/Radio/Switch, DataTable + Cell, Tabs, Dialog,
Banner/Toast, ThemeProvider, Stack.

**Themes:** light, dark, high-contrast. A theme is a role→primitive mapping; adding one requires no
component change.

| Measured | Value |
|---|---|
| Runtime dependencies | **0** (React/React DOM are peers) |
| ESM bundle | **4.34 kB** gzip (budget 8 kB) |
| Stylesheet | **4.06 kB** gzip (budget 8 kB) |
| Theme switch cost | **0 React renders** |
| Ticking frame time, Chromium/Firefox | **p95 16.7 ms**, 0 dropped frames |
| Ticking frame time, WebKit | **gates pass on real macOS WebKit**; the 26–36 ms seen on the Playwright port was a port artifact (resolved 2026-09-17) |
| axe (light + dark, 3 engines) | **0 violations** |
| Contrast contract | **63/63 pairs** across 3 themes |

## Verify it

```powershell
npm run ci        # contract + build + contrast + demo + harness + size + all three suites
```

Individual: `npm run check:contract` · `check:contrast` · `verify` · `verify:demo` · `verify:browser`
· `size`. Every one exits non-zero on failure.

## Known issues

1. ~~**WebKit ticking performance.**~~ **Resolved 2026-09-17; re-verified on this repo.** The
   `browser-macos` CI job passed
   ([gh run 35321214702](https://github.com/trade/ui/actions/runs/35321214702)): real macOS
   WebKit **passes every perf gate** (12/12 on desktop and mobile). The slow ticking was a
   Playwright-port artifact, not a Safari bug. The mirror problem remains — Chromium on the shared
   macOS runner cannot hold the perf gates (static p95 read 50 ms, which no real hardware
   produces) — so on macOS only WebKit's perf gates and other engines' perf is informational.
2. ~~**No visual regression.**~~ **Gate added 2026-09-18 (win32); CI gating pending ubuntu baselines.**
   The browser suite now pixel-compares every screenshot (3 engines × 2 viewports × 2 themes)
   against the committed, read-only `baselines/<platform>/` directory and fails on a diff above
   0.3% of pixels — calibrated against observed run-to-run antialiasing noise (< 0.21%), and
   verified to catch a real layout change (12/12 visual checks failed on an injected table-padding
   change). Regeneration is the explicit `npm run baselines:update`; comparison never writes the
   directory. Baselines are platform-bound, so visual checks gate on platforms that have baselines
   (currently win32) and are informational elsewhere; CI runs on ubuntu, so a layout regression
   still passes CI until an ubuntu baseline set is committed (see issue #3).
3. **No secrets scanning.** Only keyword matching was done; the project carries no credentials.

## Not started

- Phase 2 components: `Menu`/`Popover`, `Tooltip`, and a listbox `Select` (currently native
  `<select>`-backed on purpose).
- Tick coalescing helper (`useTicks`).

## Next, in order

1. Generate and commit an **ubuntu baseline set** (`npm run baselines:update` on ubuntu, e.g. via
   Docker with the Playwright image) so the visual gate hard-fails in CI, not only locally.
2. Phase 2 components.

A fuller optimisation roadmap (density, theme splitting, component tokens, icons, motion, publishing)
was produced during the build; the items above are the ones that block or de-risk the others.

## Settled architecture

The frozen token scale, the zero-dependency rule, static CSS with attribute theming, and motion
off by default are all recorded with their reasoning in `DECISIONS.md`. Treat them as settled.
