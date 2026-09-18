# AGENTS.md — operating instructions for agents working in this repository

You are changing a component system where every rule is load-bearing. This file tells you what you
may freely do, what you must never do, and the exact workflow that makes changes safe. It is shorter
than the human docs on purpose: it is the contract, `CONTRIBUTING.md` is the manual.

## Context to load before changing anything

1. `DECISIONS.md` — settled architecture. Treat every ADR as binding unless the user explicitly
   reopens it. If a task conflicts with an ADR, stop and surface the conflict; do not work around it.
2. `STATUS.md` — known issues and the ordered roadmap. Do work that moves this list.
3. `CONTRIBUTING.md` § 1 "The laws" — the eight rules summarized below.

## Hard invariants — never do these, no exceptions, no "small" versions

1. **No runtime dependencies.** Never add anything to `dependencies` of `@trade/ui` or
   `@trade/tokens`. React/ReactDOM stay peers. (Gate: `check-contract.mjs`.)
2. **No animation, ever.** The only legal `transition`/`animation` value is `none`. Never author
   keyframes, `@keyframes`, animated toasts, spinners, or easing. (Gate: `check-style.mjs`.)
3. **No raw values in component CSS.** No hex/`rgb()`/`hsl()`, no literal `z-index`, no hand-written
   `box-shadow`, no literal `font-size`. Everything reads `var(--ui-*)`. New values start in
   `packages/tokens/tokens.json`. (Gate: `check-style.mjs`.)
4. **No physical `left`/`right` layout properties.** Use `inline-start`/`inline-end`,
   `text-align: start/end`. (Gate: `check-style.mjs`.)
5. **No `!important`, no vendor prefixes** (except the existing `-webkit-font-smoothing` in
   `base.css`). No CSS-in-JS, no inline `style` props, no `styled-*`. (Gate: `check-style.mjs`.)
6. **Theme changes touch all themes.** A new role is added to `light`, `dark`, AND `high-contrast`
   in the same change, as a `{primitive.reference}` — never a literal. The token build fails on
   divergence; do not weaken the build to get past it. (Gate: `build-tokens.mjs`,
   `check-contrast.mjs`.)
7. **Never edit generated files.** `packages/*/dist/**`, `packages/tokens/dist/tokens.css|ts`,
   `apps/*/dist/**`, `harness/dist/**` are build output. Edit the source and rebuild.
8. **Never break public API.** Exported names, prop names, and token names (`--ui-*`) are consumer
   surface. Changes are additive. Renames/removals are breaking changes requiring a version decision
   from the user.
9. **Never weaken a gate to make a change pass.** If a check fails, the change is wrong or the check
   is wrong — fix one of those two things, in the open, with the user's knowledge. Deleting,
   skipping, or loosening thresholds silently is the one unrecoverable mistake in this repo.
10. **Accessibility is not optional polish.** Keyboard paths, `:focus-visible`, ARIA honesty
    (`aria-rowcount` = data length, not DOM length), non-colour signalling. If your change can
    affect interaction, `npm run verify` and `npm run verify:browser` must both run before you call
    it done. (Gate: axe both themes × 3 engines.)

## Repository map

```
packages/tokens/tokens.json        the ONLY place raw values live (3 tiers; see header comment)
packages/tokens/build-tokens.mjs   compiles tokens → dist/tokens.css + tokens.ts; fails on drift
packages/ui/src/components/        one file per component; forwardRef; cx(); ...rest spread
packages/ui/styles/                one hand-written CSS file per area; auto-discovered by build.mjs
packages/ui/build.mjs              esbuild ESM+CJS, tsc .d.ts, concatenates tokens.css + styles
apps/example/src/main.jsx          the component reference screen — show new components here
apps/example-trading/src/main.jsx  the production-grade trading workspace example
scripts/verify.mjs                 38 library checks (SSR, CSS, DOM interactions) — add checks here
scripts/verify-example.mjs         10 checks against the built example bundle
scripts/browser-suite.mjs          84 checks × {chromium,firefox,webkit} × {desktop,mobile}
scripts/check-contract.mjs         package promises (zero deps, peer React, exports map)
scripts/check-contrast.mjs         WCAG contrast over every theme's role pairs — extend on new pairs
scripts/check-style.mjs            CSS authoring contract (the laws, executable — library AND example apps)
```

## The standard loop — run it for every change, however small

```
npm run build && npm run check:contrast && npm run check:style && npm run verify
npm run example:build && npm run verify:example    # anything touching the examples
npm run verify:browser                          # anything touching styles, layout, focus
```

Every command exits non-zero on failure; treat a non-zero exit as "the work is wrong", not "the
command is flaky". `npm run ci` runs the whole chain in order.

## Component recipe (exact steps)

1. Need new visual values? → `tokens.json` first (all themes if it's a role), rebuild, contrast gate.
2. `packages/ui/styles/<area>.css` — classes rooted `.ui-*`; density via
   `calc(<px> * var(--ui-density))` + `--compact`/`--dense` variants setting
   `--ui-density: var(--ui-density-compact|dense)`.
3. `packages/ui/src/components/<Name>.tsx` — `forwardRef`; destructure props; `cx('ui-x',
   variant/density classes, className)`; spread `...rest`; default to the native element; guard
   `typeof window/document === 'undefined'` for any DOM access.
4. Export from `src/index.ts`.
5. Add interaction checks to `scripts/verify.mjs`; render it in `scripts/sample-screen.mjs`.
6. Use it in `apps/example/src/main.jsx` (states + densities + both themes).

## Rule zero for checks

Every rule in this file that can be executed IS executed by a script in `scripts/`. When you add a
new convention, add its check in the same change — a rule without a gate rots. When you add a theme
or a foreground/background pair, extend `check-contrast.mjs` in the same change. If you cannot gate a
rule, record it in `STATUS.md` as ungated so it stays visible.

## Git protocol

- Conventional prefixes (`feat:`, `fix:`, `docs:`, `ci:`, `test:`, `chore:`), subject ≤ 50 chars
  (72 hard max), imperative, one concern per commit.
- Body carries evidence: numbers, check counts, the command that produced them.
- Never commit generated output (`dist/`, `verification/*.json`, `verification/screenshots/`),
  credentials, or absolute local paths. **Reviewed exception:** `baselines/<platform>/` PNGs are
  committed on purpose — they are versioned inputs (the visual-regression expected state),
  regenerated only by the explicit `npm run baselines:update`, never by a compare run.
- **Never push, publish, create remotes, or open PRs unless the user explicitly instructs it in the
  current task.** Local commits are the default stopping point; report and wait.
- If a CI run exists for your commit, watch it to completion and read the failures yourself before
  reporting success.

## Definition of done

- [ ] All gates green locally (`build`, `check:contrast`, `check:style`, `check:types`,
      `check:docs`, `verify`, `verify:example`, `verify:browser` when relevant)
- [ ] New states/behaviours have checks (§ Rule zero)
- [ ] README change-guide row updated if files/knobs changed; STATUS.md updated if known issues moved
- [ ] Committed locally with evidence; push only on explicit instruction
- [ ] Final report states what passed, with the counts, and what remains open
