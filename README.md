# UI — `@trade/ui`

React components for dense, data-heavy interfaces — **static CSS**, **light, dark and high-contrast themes**, **no animation**, and **zero runtime dependencies**.

This is the Phase 1 implementation of the `@trade/ui` proposal: the token pipeline plus the starter component set, built and verified.

---

## Quick start

```powershell
cd ui
npm install
npm run build          # tokens → CSS + TS, then the library (ESM, CJS, d.ts, CSS)
npm run demo           # bundles the reference demo to apps/demo/dist
npm run verify         # 33 checks: contract, CSS, SSR, DOM interactions
npm run verify:demo    # 10 checks: boots the built demo in a DOM and drives it
npm run screen:build   # bundles the trading workspace screen
npm run verify:screen  # 24 checks: virtualization, ARIA, themes, axe on the screen
```

Open the demo: **`apps/demo/dist/index.html`** (double-click — it is a plain static file, no server needed).

---

## Layout

```
ui/
├─ packages/
│  ├─ tokens/            @trade/tokens — tokens.json → tokens.css + tokens.ts (no deps)
│  └─ ui/                @trade/ui     — components, styles, build
│     ├─ src/components/ Button, Input, Select, Field, SelectionControls,
│     │                  DataTable, Tabs, Dialog, Feedback, ThemeProvider, Stack
│     ├─ styles/         one CSS file per area (base, layout, button, forms, table, tabs, feedback, dialog)
│     └─ dist/           index.js · index.cjs · index.d.ts · ui.css · components/*.css
├─ apps/demo/            reference "watchlist + order ticket" app
├─ scripts/              verify.mjs · verify-demo.mjs · build-demo.mjs · sample-screen.mjs
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
| Demo content or instruments | `apps/demo/src/main.jsx` |
| What "correct" means | `scripts/verify.mjs`, `scripts/verify-demo.mjs` |

After any change: `npm run build && npm run demo && npm run verify && npm run verify:demo`.

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

- `Select` is native-`<select>` backed for correctness and zero dependencies; a custom listbox is Phase 2.
- No virtualizer is shipped — `DataTable` is virtualizer-friendly (`rowCount` keeps ARIA honest) so consumers plug in their own.
- `Menu`/`Popover` and `Tooltip` are not built yet.
- The demo bundles React into a 237 KB IIFE for convenience; the library itself is 4.2 KB gzip and depends on nothing.

## Verification & CI

```powershell
npm run check:contract  # 12 checks: zero deps, peer-only React, exports map, artifacts
npm run check:contrast  # 63 colour pairs across 3 themes must meet the contrast contract
npm run check:style     # 72 checks: the CSS authoring contract (tokens-only, logical, motionless)
npm run check:docs      # every relative link in docs/** must resolve — no dangling guide pages
npm run size            # bundle budgets (ESM 8 kB, stylesheet 8 kB, types 3 kB, gzip)
npm run verify          # 33 checks: contract, CSS, SSR, DOM interactions
npm run verify:demo     # 10 checks: boots the real bundle in a DOM
npm run harness:build   # required before verify:browser (harness/dist is gitignored)
npm run verify:browser  # 72 checks: Chromium + Firefox + WebKit × desktop + mobile

npm run all             # build + demo + harness + the verification suites
npm run ci              # contract + build + demo + harness + size + every suite
```

Every suite exits non-zero on failure, so they work as gates. GitHub Actions runs four jobs
(`.github/workflows/ci.yml`): `build`, `size`, `verify` on Linux, and `browser-macos` to measure the
real macOS WebKit engine. Reports land in `verification/` and are uploaded as CI artifacts.

### Measurement reliability

Headless browsers get throttled unpredictably by the host — we have observed a static reading of
**1.3 fps with a 1568 ms frame delta**, which is the environment, not the library. A gate built on
numbers that move between runs is worse than no gate, so the browser suite:

- launches Chromium with background-throttling disabled,
- settles 1500 ms after the page finishes before measuring,
- retries a combo once when a reading looks throttled, keeping the better attempt, and
- gates on **p95 frame delta** and the **dropped-frame ratio**, not absolute fps (headless engines
drive `requestAnimationFrame` at engine-specific cadences — Firefox measures the same fps ticking
and idle).

This makes runs reproducible: the WebKit ticking cadence is reported **informationally** on
non-macOS hosts (it is the Playwright port, not Safari) and gated for real only in the
`browser-macos` CI job, so a full local run is a clean 72/72 on every host instead of
disagreeing run to run.

## Git

The repository root is this directory. Generated output (`packages/*/dist`, `apps/*/dist`,
`harness/dist`, `verification/*.json`, `verification/screenshots/`) is ignored. Line endings are
normalised to LF via `.gitattributes`.

### Commit conventions

- **Subject ≤ 50 characters (72 hard max)**, imperative mood, conventional prefix (`feat:`, `fix:`,
  `docs:`, `ci:`, `test:`, `chore:`) — gated by `npm run check:commits`.
- **One concern per commit.** Some early commits bundle several fixes together; splitting them makes
  a bisect actually useful.
- **Never commit generated binaries.** Screenshots change on every run; they belong in CI artifacts.
- **Message body records the evidence** — the measurement and the command that produced it — since
  that is what makes a change reviewable months later.
- **No credentials, no research notes, no absolute local paths.** The workspace root has its own
  `.gitignore` as a safety net against the first two.
