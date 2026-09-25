# UI — `@trade/ui`

React components for dense, data-heavy interfaces — **static CSS**, **light, dark and high-contrast themes**, **no animation**, and **zero runtime dependencies**.

This is the Phase 1 implementation of the `@trade/ui` proposal: the token pipeline plus the starter component set, built and verified.

---

## Quick start

```powershell
cd ui
npm install
npm run build          # tokens → CSS + TS, then the library (ESM, CJS, d.ts, CSS)
npm run example:build     # bundles the component example to apps/example/dist
npm run verify         # 68 checks: CSS health, SSR markup, DOM interactions
npm run verify:example    # 10 checks: boots the built example in a DOM and drives it
npm run example-trading:build  # bundles the trading workspace example
npm run verify:example-trading  # 28 checks: virtualization, ARIA, ticket guard, axe, 2 viewports
```

Open the examples (double-click — plain static files, no server needed):
**`apps/example/dist/index.html`** (component reference) · **`apps/example-trading/dist/index.html`** (trading workspace).

---

## Layout

```
ui/
├─ packages/
│  ├─ tokens/            @trade/tokens — tokens.json → tokens.css + tokens.ts (no deps)
│  └─ ui/                @trade/ui     — components, styles, build
│     ├─ src/components/ Button, Input, Select, Field, SelectionControls,
│     │                  DataTable, Tabs, Menu, Popover, Tooltip, Dialog, Feedback, ThemeProvider, Stack
│     ├─ src/hooks/      useTicks (tick coalescing)
│     ├─ styles/         one CSS file per area (base, layout, button, forms, table, tabs, feedback, dialog, menu, popover, tooltip)
│     └─ dist/           index.js · index.cjs · index.d.ts · ui.css · components/*.css
├─ apps/                 examples — apps/example (component reference),
│                        apps/example-trading (production-grade trading workspace)
├─ scripts/              verify.mjs · verify-example.mjs · build-example.mjs
│                        verify-example-trading.mjs · browser-suite.mjs · sample-screen.mjs
├─ CONTRIBUTING.md       the rules of changing this codebase (and their gates)
├─ AGENTS.md             the same contract, machine-facing
└─ docs/                 the UI development guide (tokens, theming, components, CSS, a11y, verification)
```

## Using the library

```tsx
import { ThemeProvider, Button, DataTable, Cell } from '@trade/ui';
import '@trade/ui/styles.css';

<ThemeProvider theme="system">
  <Button variant="primary" density="compact">Submit order</Button>
</ThemeProvider>
```

Theme switching without a render (the cheapest path):

```ts
import { setThemeAttribute } from '@trade/ui';
setThemeAttribute('dark');   // writes data-theme on <html>; zero React renders
```

---

## Architecture decisions implemented

| Decision | Implementation |
|---|---|
| Minimal dependencies | `dependencies: {}` — React/React DOM are peers only |
| Consistency | One token vocabulary (`--ui-*`) drives every component |
| Efficiency | Static CSS, no CSS-in-JS runtime; per-component CSS files for import-level tree-shaking |
| Non-animated | Core has no transitions; the only `transition` declarations set `none` |
| Light + dark | Same token names in both themes, switched by one attribute |
| Cross-browser | Standard CSS custom properties; no `light-dark()` or `@layer` dependency in the core |
| Trading-ready | Dense density, tabular numerals, direction glyphs, ARIA grid with honest row counts |

---

## Change guide

| To change… | Edit |
|---|---|
| Brand/semantic colours, light or dark | `packages/tokens/tokens.json` → `color` |
| Spacing, radius, type scale, elevation | `packages/tokens/tokens.json` → `space` / `radius` / `font` / `elevation` |
| Component density | `packages/tokens/tokens.json` → `density` (comfortable 1 / compact .75 / dense .625) |
| Whether motion exists at all | `packages/tokens/tokens.json` → `motion.enabled` (keep `false` for v1) |
| A component's look | `packages/ui/styles/<area>.css` |
| A component's API/behaviour | `packages/ui/src/components/<Name>.tsx` |
| Example content or instruments | `apps/example/src/main.jsx`, `apps/example-trading/src/main.jsx` |
| What "correct" means | `scripts/verify.mjs`, `scripts/verify-example.mjs`, `scripts/verify-example-trading.mjs` |
| What pixels should look like | `npm run baselines:update` rewrites `baselines/<platform>/`; the suite compares against it read-only every `verify:browser` run |

After any change: `npm run build && npm run example:build && npm run verify && npm run verify:example`.

---

## Quality coverage

- **Themes:** light, dark and system, switched with zero React renders (verified).
- **States:** default / hover / active / focus-visible / disabled on Button; invalid + error text on Input, wired with `aria-invalid` and `aria-describedby`; disabled rows and buttons.
- **Data density:** comfortable, compact and dense densities on buttons, inputs, tables and tabs.
- **Accessibility:** ARIA grid (`role="grid"`, `aria-rowcount`, `aria-rowindex`), roving-tabindex tabs, modal dialog with focus moved in and restored, Escape to dismiss, visible focus rings, direction glyphs so colour is never the only signal.
- **Numerals:** `font-variant-numeric: tabular-nums` on numeric cells so ticking prices never reflow.
- **Empty state:** `DataTable` renders a dedicated empty row.
- **Responsive:** fluid tables inside a scroll container; the demo header wraps.

## Known limitations (Phase 1)

- No virtualizer is shipped — `DataTable` is virtualizer-friendly (`rowCount` keeps ARIA honest) so consumers plug in their own.
- The examples bundle React into an IIFE for convenience; the library itself is 5.89 kB min+gzip for the full surface (620 B for a single-component import) and depends on nothing.

## Verification & CI

```powershell
npm run check:contract  # 12 checks: zero deps, peer-only React, exports map, artifacts
npm run check:pack      # 8 checks: the real tarballs — entry points resolve, terms ship, nothing leaks
npm run check:contrast  # 69 colour pairs across 3 themes must meet the contrast contract
npm run check:style     # 141 checks: the CSS authoring contract (tokens-only, logical, motionless, guarded :hover)
npm run check:types     # tsc --noEmit over @trade/ui — strict types are a gate, not a suggestion
npm test                # 14 unit tests for the pure modules (node:test; no browser, no deps)
npm run check:license   # licence headers + manifests agree (MIT OR Apache-2.0)
npm run check:docs      # links resolve + documented check counts agree with the suites themselves
npm run check:perf-policy  # 71 checks: the perf-retry rules, the gated verdicts, the pinned knobs
npm run size            # bundle budgets, measured min+gzip the way a consumer ships it
npm run verify          # 68 checks: CSS health, SSR markup, DOM interactions
npm run verify:example  # 10 checks: boots the real example bundle in a DOM
npm run harness:build   # required before verify:browser (harness/dist is gitignored)
npm run verify:browser  # 84 checks: Chromium + Firefox + WebKit × desktop + mobile,
                        # incl. 12 visual-regression checks vs baselines/<platform>/
npm run verify:browser:docker  # the same suite inside CI's pinned image (hosts below Playwright's macOS 14 floor)

npm run all             # build + contract + unit tests + demo + harness + the verification suites
npm run ci              # contract + build + demo + harness + size + every suite
```

Every suite exits non-zero on failure, so they work as gates. GitHub Actions runs four jobs
(`.github/workflows/ci.yml`): `build`, `size`, `verify` on Linux, and `browser-macos` to measure the
real macOS WebKit engine — plus a `baselines` job on manual dispatch that regenerates the linux
baseline set in the verify container (see Visual baselines). Reports land in `verification/` and
are uploaded as CI artifacts.

### Measurement reliability

Headless browsers get throttled unpredictably by the host — we have observed a static reading of
**1.3 fps with a 1568 ms frame delta**, which is the environment, not the library. A gate built on
numbers that move between runs is worse than no gate, so the browser suite:

- launches Chromium with background-throttling disabled,
- settles 1500 ms after the page finishes before measuring,
- re-measures a combo when a reading looks throttled, when a gated reading is only marginally
  over budget, or when an earlier combo in the same run read catastrophically (the host is
  thrashing) - keeping the better attempt (`scripts/perf-policy.mjs`, checked by
  `npm run check:perf-policy`), and
- gates on **p95 frame delta** and the **dropped-frame ratio**, not absolute fps (headless engines
drive `requestAnimationFrame` at engine-specific cadences — Firefox measures the same fps ticking
and idle).

Visual captures are held to the same standard (ADR-005): before any screenshot the harness
**freezes for capture** — the data feed stops, the ticking table resets to its canonical state,
and volatile audit text (wall clock, perf figures) is rewritten in the DOM. The suite parses the
real numbers from the in-memory log and hard-fails a run whose harness cannot prove it froze.
On unchanged UI, two consecutive runs now produce **0 differing pixels** across all 12 captures —
so any nonzero diff is a real change, and the 0.3% budget stays calibrated for antialiasing only.

This makes runs reproducible: the WebKit ticking cadence is reported **informationally** on
non-macOS hosts (it is the Playwright port, not Safari) and gated for real only in the
`browser-macos` CI job, so a full local run is a clean 84/84 on every host instead of
disagreeing run to run.

### Visual baselines

`baselines/<platform>/` are versioned inputs, committed on purpose (the one reviewed exception to
"never commit generated output"). Comparison is read-only; regeneration is explicit:

- **Local:** `npm run baselines:update` — rewrites only the current platform's directory.
- **CI:** the `baselines` job (`gh workflow run ci.yml --ref <branch>`, workflow_dispatch) runs in
  the exact verify container — same digest-pinned image, shm and HOME — and uploads
  `baselines-linux` as an artifact for review and manual commit. Generation environment equals
  comparison environment by construction; adding a platform (macOS next) is mechanical.

## Git

The repository root is this directory. Generated output (`packages/*/dist`, `apps/*/dist`,
`harness/dist`, `verification/*.json`, `verification/screenshots/`) is ignored. Line endings are
normalised to LF via `.gitattributes`.

### Commit conventions

- **Subject ≤ 50 characters (72 hard max)**, imperative mood, conventional prefix (`feat:`, `fix:`,
  `docs:`, `ci:`, `test:`, `chore:`) — gated by `npm run check:commits`.
- **One concern per commit.** Some early commits bundle several fixes together; splitting them makes
  a bisect actually useful.
- **Never commit generated binaries** (`dist/`, `verification/`) — with one reviewed exception:
  `baselines/<platform>/` PNGs are committed on purpose. They are versioned inputs (the
  visual-regression expected state), rewritten only by the explicit `npm run baselines:update` or
  the CI `baselines` job, never by a compare run.
- **Message body records the evidence** — the measurement and the command that produced it — since
  that is what makes a change reviewable months later.
- **No credentials, no research notes, no absolute local paths.** The workspace root has its own
  `.gitignore` as a safety net against the first two.
