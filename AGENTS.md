# AGENTS.md — operating instructions for agents working in this repository

You are changing a component system where every rule is load-bearing. This file is the contract;
`CONTRIBUTING.md` is the human manual. Skim the invariants below first. Open other docs only when
the router says you need them.

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
10. **Licence headers travel with the code.** The project is dual-licensed (MIT OR Apache-2.0,
    `LICENSE`). Every new source file starts with an `SPDX-License-Identifier`; the copyright
    notice lives in the licence files (`LICENSE-MIT`), not in per-file headers. Package manifests
    keep `"license": "MIT OR Apache-2.0"`. (Gate: `check-license.mjs`.)
11. **Accessibility is not optional polish.** Keyboard paths, `:focus-visible`, ARIA honesty
    (`aria-rowcount` = data length, not DOM length), non-colour signalling. If your change can
    affect interaction, `npm run verify` and `npm run verify:browser` must both run before you call
    it done. (Gate: axe both themes × 3 engines.)

## Context router — open only what the task needs

| If the task… | Open |
|---|---|
| Conflicts with architecture or proposes a new dependency/motion model | `DECISIONS.md` (ADRs are binding; stop and surface conflicts — do not work around them) |
| Touches known issues, roadmap, or “what’s left” | `STATUS.md` |
| Needs the full recipe, token tiers, or PR/commit conventions in depth | `CONTRIBUTING.md` (laws §1, recipe §3, commits §7) |
| Needs system depth (tokens, theming, CSS, a11y, verification, perf) | `docs/<topic>.md` via `docs/README.md` |
| Otherwise | Stay in this file; follow the verification ladder |

## Path reminders

| You are editing… | Remember |
|---|---|
| `packages/ui/styles/**` | `var(--ui-*)` only; animation/`transition` only `none`; logical props; no `!important` |
| `packages/tokens/**` | Roles in **all three** themes as `{primitive.reference}`; extend `check-contrast.mjs` for new pairs; never hand-edit `dist/` |
| `scripts/**` | Never loosen thresholds to land a change; new conventions get a check in the same change (rule zero); baselines only via `npm run baselines:update` |

## Repository map

```
packages/tokens/tokens.json        the ONLY place raw values live (3 tiers; see header comment)
packages/tokens/build-tokens.mjs   compiles tokens → dist/tokens.css + tokens.ts; fails on drift
packages/ui/src/components/        one file per component; forwardRef; cx(); ...rest spread
packages/ui/styles/                one hand-written CSS file per area; auto-discovered by build.mjs
packages/ui/build.mjs              esbuild ESM+CJS, tsc .d.ts, concatenates tokens.css + styles
apps/example/src/main.jsx          the component reference screen — show new components here
apps/example-trading/src/main.jsx  the production-grade trading workspace example
scripts/verify.mjs                 library checks (SSR, CSS, DOM interactions) — add checks here
scripts/verify-example.mjs         example-bundle checks — add checks here
scripts/browser-suite.mjs          90 checks × {chromium,firefox,webkit} × {desktop,mobile}
scripts/perf-policy.mjs            the perf-retry rules, pure and browser-free
scripts/check-perf-policy.mjs      exercises every retry branch and pins the 25 ms budget
scripts/check-contract.mjs         package promises (zero deps, peer React, exports map)
scripts/check-contrast.mjs         WCAG contrast over every theme's role pairs — extend on new pairs
scripts/check-style.mjs            CSS authoring contract (the laws, executable — library AND example apps)
```

## Verification ladder — run what the change class requires

Non-zero exit means the work is wrong, not that the command is flaky. When unsure or multi-area,
run `npm run ci`.

| Change class | Minimum |
|---|---|
| Docs / markdown only | `npm run check:docs` (full chain if docs affect counts/README) |
| Tokens (`tokens.json` / token build) | `npm run build` && `npm run check:contrast` |
| Library CSS / layout / focus | `npm run build` && `npm run check:style` && `npm run verify` && `npm run verify:browser` |
| Components / public API | build + `check:style` + `check:types` + `verify`; add contrast if roles changed; example build/verify for touched apps; `verify:browser` if interaction or a11y |
| Examples only | `npm run example:build` && `npm run verify:example` (and/or example-trading equivalents) |
| Scripts / gates | Run the touched script(s); `check:docs` if docs quote counts; **never** loosen a threshold to pass |
| Full release confidence | `npm run ci` |

Report the commands you ran and the pass counts they printed.

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

Deep examples: `CONTRIBUTING.md` § 3.

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
- **A green check is not a review.** `Greptile Review`, CodeQL and `github-code-quality` all report
  *pass* while attaching non-blocking findings. Read every review source before merging — these
  are the whole protocol, and every one of them pages, so a single call is never the whole answer:
  - inline review comments: `gh api --paginate repos/{owner}/{repo}/pulls/<n>/comments`
  - every issue-level comment, including Greptile's "Comments Outside Diff" cross-file list:
    `gh api --paginate repos/{owner}/{repo}/issues/<n>/comments`
  - review states: `gh api --paginate repos/{owner}/{repo}/pulls/<n>/reviews`
  - thread resolution: `gh api graphql -f query='{repository(owner:"OWNER",name:"REPO"){pullRequest(number:<n>){reviewThreads(first:100){pageInfo{hasNextPage endCursor}nodes{isResolved isOutdated path}}}}}'`,
    then repeat with `after:"<endCursor>"` while `hasNextPage` is true. On PowerShell pass the query
    as a file with `-F query=@query.graphql`, written without a BOM (`Set-Content -Encoding UTF8`
    adds one, and gh rejects the file).
  - committed alerts: `gh api --paginate "repos/{owner}/{repo}/code-scanning/alerts?state=open"`

  Verify every finding against the code before acting on it — bot findings are sometimes false
  positives (a live `useTheme` was once reported unused). Re-check after every push: a fix can introduce a
  new finding and a resolved thread can reopen. Never merge on "all checks green" alone. No gate can
  enforce this one, so STATUS.md records it as ungated.

## Definition of done

- [ ] Ladder commands for this change class are green (or `npm run ci` if unsure)
- [ ] New states/behaviours have checks (§ Rule zero)
- [ ] README change-guide row updated if files/knobs changed; STATUS.md updated if known issues moved
- [ ] Committed locally with evidence; push only on explicit instruction
- [ ] Final report states what passed, with the counts, and what remains open
