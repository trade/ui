# Contributing to `@trade/ui`

This is a component system for dense, data-heavy interfaces: **static CSS**, **token-driven themes**,
**zero runtime dependencies**, **no animation**. Every rule below exists because breaking it has a
cost someone else pays — a reflow at 60 Hz, a theme that fails contrast, a layout that dies in RTL.
Most rules are enforced by a gate; where a rule says *gated*, CI already checks it and you will not
be able to land a violation. Where it is not gated, it is review discipline.

**Read order for anything non-trivial:** `README.md` (what/how) → `DECISIONS.md` (why, immutable) →
this file (how to change things safely) → `STATUS.md` (where the project stands).

---

## 1. The laws

These apply to every change. Each is cheap to follow and expensive to break.

1. **Components read roles, never primitives.** A component may only reference theme *role*
   variables (`--ui-primary`, `--ui-on-surface`, …). Raw values — hex, `rgb()`, font sizes, z-index
   numbers, shadow literals — belong in `packages/tokens/tokens.json` tier 1 and nowhere else.
   *Gated:* `check-style.mjs`, and the all-themes literal check in `verify.mjs`.
2. **A theme is a mapping, not a stylesheet.** Every theme in `tokens.json` defines the *same* role
   set, each role a `{primitive.reference}` — no literals, no extra roles, no missing roles. Adding
   a role means adding it to **all three themes** before the build will pass.
   *Gated:* `build-tokens.mjs` fails on divergence; `check-contrast.mjs` fails on illegible pairs.
3. **CSS is static and structural.** One hand-written file per area in `packages/ui/styles/`, class
   selectors rooted at `.ui-*`, no CSS-in-JS, no inline `style` props, no `!important`, single-class
   specificity by default. *Gated:* `check-style.mjs`.
4. **Motion does not exist.** The only permitted `transition`/`animation` value is `none`. Reduced-
   motion compliance is satisfied by construction. *Gated:* `check-style.mjs` + stylesheet scan in
   `verify.mjs`.
5. **Layout is direction-agnostic.** Use logical properties (`inline-start`/`inline-end`, `start`/`end`)
   — never `left`/`right` physical forms. An RTL user gets a correct mirror for free.
   *Gated:* `check-style.mjs`.
6. **Stacking and depth are scales.** `z-index` only via `--ui-z-*`; `box-shadow` only via
   `--ui-elevation-*`. Local z-index decisions are how two overlays end up fighting.
   *Gated:* `check-style.mjs`.
7. **Zero runtime dependencies is a contract.** React and React DOM are peers. Nothing else —
   no hooks libraries, no headless primitives, no class-name utilities. If hand-rolling a primitive
   ever costs more than a dependency would, take it to `DECISIONS.md` first (see ADR-002's revisit
   criterion) — do not just add the package. *Gated:* `check-contract.mjs`.
8. **Accessibility is functional correctness.** A component that renders but fails keyboard or ARIA
   semantics is broken. Focus-visible rings everywhere, honest ARIA counts (`aria-rowcount` reflects
   data, not DOM), colour never the only signal (pair with glyphs/text), dialogs trap and restore
   focus. *Gated:* axe in both themes × 3 engines, DOM interaction tests in `verify.mjs`.

## 2. The token model in practice

Three tiers, compiled by `packages/tokens/build-tokens.mjs`:

| Tier | Lives in | Emits | You touch it when |
|---|---|---|---|
| Primitive (raw values) | `tokens.json → primitive` | `--ui-ref-*` | adding a colour step or a new scale value |
| Theme role (meaning) | `tokens.json → themes` | `--ui-<role>` mapping to refs | naming a new semantic colour |
| Structural (theme-less) | `tokens.json → primitive.{space,radius,font,elevation,zIndex,opacity,density}` | `--ui-space-*` etc. | changing rhythm/scale — frozen, see ADR-001 |

- **Change a colour:** edit `themes.<theme>.<role>` to point at a different primitive. Never edit a
  component. Run `npm run build && npm run check:contrast` — the contrast contract must hold in all
  themes or the build fails.
- **Add a role:** add the key to *every* theme in the same commit, referencing primitives. Then add
  the pair to `scripts/check-contrast.mjs` if it forms a foreground/background pair. Unmeasured
  pairs are how illegible themes ship.
- **Add a theme:** add a `themes.<name>` object with the identical role set, and declare
  `color-scheme` follows automatically from the build. No component change. Then extend
  `check-contrast.mjs` to cover it.
- **Structural scale is frozen** (ADR-001). Adding a step is an architecture decision, not a
  drive-by — open with a proposal in `DECISIONS.md`, not a diff.

## 3. Adding a component — the recipe

1. **Tokens first.** Does it need a new role or a new structural value? If yes, §2. Usually no.
2. **Stylesheet** `packages/ui/styles/<area>.css`. The build auto-discovers files not in its
   explicit order list and appends them; only add to the order list in `build.mjs` if cascade
   order genuinely matters. Follow the laws above. Density: dimensions read
   `calc(<px> * var(--ui-density))` so the compact/dense classes work everywhere:
   ```css
   .ui-badge--compact { --ui-density: var(--ui-density-compact); }
   .ui-badge--dense   { --ui-density: var(--ui-density-dense); }
   ```
3. **Component** in `src/components/<Name>.tsx`:
   - `forwardRef`, always. DOM components spread `...rest` after destructuring your props.
   - Variants/densities map to classes via `cx()` — no style objects.
   - Default to the least opinionated native element (`button` stays a `<button>`).
   - Guard non-DOM environments (`typeof window/document === 'undefined'`) for anything touching
     them — the library must server-render without warnings.
   ```tsx
   export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
     { tone = 'info', className, ...rest }, ref) {
     return <span ref={ref} className={cx('ui-badge', `ui-badge--${tone}`, className)} {...rest} />;
   });
   ```
4. **Export** from `src/index.ts`. Public API is frozen once shipped: additive changes only,
   renames are breaking changes.
5. **Checks.** A component without tests is not done: add DOM interaction checks to
   `scripts/verify.mjs` (keyboard, ARIA, disabled states) and use it in `scripts/sample-screen.mjs`
   so it renders in the browser suites (axe + layout + themes across 3 engines × 2 viewports).
6. **Demo.** Show it in `apps/demo` — states, densities, both themes. A component that exists only
   as an export is invisible.

## 4. Cross-platform, modern baseline

Target is the CSS custom-property baseline across Chromium, Firefox, WebKit — the browser suite
gates all three (real WebKit on macOS; the Playwright port's perf numbers are informational, see
README § Measurement reliability).

- Logical properties over physical (§1.5) — this is what makes RTL a non-project.
- No vendor prefixes. The single sanctioned exception is `-webkit-font-smoothing` in `base.css`.
  Adding another requires an ADR entry, not a comment.
- `color-scheme` is emitted per applied theme so native widgets (select arrows, scrollbars) match
  the theme's polarity. Never hand-write it; it is generated.
- Numeric data cells use `--ui-font-numeric` with `tabular-nums` so ticking prices never reflow.
- SSR-safe: no module-scope `window`/`document` access; runtime DOM reads are guarded.

## 5. Performance discipline

The library exists for screens that re-render continuously. The hot path rules:

- Static CSS only — no style computation per render, no class-string building beyond one `cx()`.
- Theme switching is one attribute write on `<html>` (`setThemeAttribute`), zero React renders.
  Never add anything that re-renders on theme change.
- Tables render a window, not the dataset; ARIA counts stay honest (`aria-rowcount`) so consumers
  can virtualize. Don't break that with full-list renders.
- `transition: none` everywhere means every state change is one paint. Keep it that way.
- Budgets: ESM ≤ 8 kB gzip, CSS ≤ 8 kB gzip, types ≤ 3 kB. *Gated:* `npm run size`.

## 6. Definition of done

`npm run build && npm run check:contrast && npm run check:style && npm run demo && npm run verify && npm run verify:demo`

— all green locally, plus `npm run verify:browser` for anything touching styles, layout, or focus
management. `npm run ci` is the full chain.

Done also means:

- [ ] New/changed states covered in `verify.mjs` (hover/active/focus-visible/disabled where relevant)
- [ ] axe clean in light **and** dark
- [ ] Works at comfortable/compact/dense if it has geometry
- [ ] No console errors in the demo (`verify:demo` gates this)
- [ ] README change-guide row updated if you added a file or a knob
- [ ] STATUS.md updated if you opened, closed, or changed a known issue

## 7. Commits and evidence

Conventions live in `README.md` § Git. Subjects follow `type(scope): summary`, matching the
`trade/ui` org convention (see its `CONTRIBUTING.md`):

| Part | Rule |
|---|---|
| `type` | One of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci` |
| `scope` | Optional area touched, lowercase (e.g. `ui`, `tokens`, `verify`, `ci`) |
| `summary` | Imperative mood, no trailing period; **aim ≤ 50 characters, 72 hard max** |

```
fix(verify): gate WebKit perf only on macOS
docs(agents): drop the duplicated file inventory
```

`ci` is an addition to the org's list (`feat fix docs chore refactor test`) — this repo's CI is a
first-class concern and its history already uses the prefix.

One concern per commit, and the body carries the *evidence* — the measurement and the command that
produced it, and the *why*, not what the diff already shows. "Made the table faster" is not
evidence; "p95 16.7 ms → 12.1 ms over 90 frames, `npm run verify:browser`" is. State only what you
actually verified.

Never commit generated output (`dist/`, `verification/*.json`, screenshots), credentials, or
absolute local paths.

## 8. Branches and pull requests

Branches use a lowercase type prefix and a short slash-separated description, again mirroring
`trade/ui`'s `CONTRIBUTING.md`:

| Prefix | Use for |
|---|---|
| `feat/` | New features or capabilities |
| `fix/` | Bug fixes |
| `docs/` | Documentation-only changes |
| `chore/` | Maintenance (deps, tooling, config) |
| `refactor/` | Code changes that neither fix a bug nor add a feature |
| `test/` | Adding or updating tests |

Example: `feat/listbox-select`, `fix/table-rowindex`, `docs/tokens-guide`. Avoid parentheses and
other shell metacharacters — git accepts them, but bash and zsh treat `(` as syntax, so
`git push origin fix(x)` fails unless quoted every time.

Pull requests:

1. Fork the repository (or branch from `main` if you have write access).
2. Create a branch with the naming convention above.
3. Make the change; every commit follows § 7.
4. **All gates green before opening** — `npm run ci` locally, and CI must pass on the PR itself.
   A red PR is not a reviewable PR. PR description carries the same evidence the commit body does.
5. Open the pull request.

**Open PRs early.** Prefer opening a PR as soon as there is something reviewable, even if the
work is unfinished — it gives visibility and allows early feedback on direction. Keep PRs small
and focused: a series of small, merged PRs beats one large one.

For the maintainers' own workflow: local commits are the default stopping point; push and PR only
on explicit instruction (AGENTS.md § Git protocol).

## 9. Writing documentation — callouts

Documentation may use GitHub's five alert types as blockquote callouts (`> [!NOTE]` …). The
vocabulary is fixed: each type maps to a **consequence for the reader**, not a mood. Pick the one
whose consequence matches — writers don't choose by taste.

| Callout | Use when skipping it… | In this repo, typically |
|---|---|---|
| `> [!NOTE]` | …costs nothing; background worth knowing | why an ADR exists, cross-links |
| `> [!TIP]` | …means more work than necessary | shortcuts, `check:docs`-style helpers |
| `> [!IMPORTANT]` | …the task at hand fails or is misunderstood | the recipe order, contract pointers |
| `> [!WARNING]` | …hours are wasted debugging the wrong thing | gate failures that look like flakes |
| `> [!CAUTION]` | …something **irreversible** happens | weakening a gate, history rewrites |

Scarcity rules:

- Callouts are **emphasis, never structure** — don't replace headings or lists with them.
- **At most one per section.** If two sections need the same callout, say it once, in prose, at
  the source of truth.
- Never nest callouts or stack them back-to-back.
- Only the five exact types above, uppercase, on the first line of the blockquote —
  `check:docs` fails on anything else.

Two honest limits: the *severity choice* is not machine-gateable (a reviewer judges whether
`[!WARNING]` was proportionate), and alerts render only on GitHub — in plain markdown viewers they
degrade to an ordinary blockquote, so the text must read correctly without the highlight.
