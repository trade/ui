# Scaling

How this codebase grows — new components, themes, values, checks — without drift. The short
version is in [AGENTS.md](../AGENTS.md) (the contract) and `CONTRIBUTING.md` § 3 (the recipe);
this page explains the mechanics. Related: [design-tokens.md](design-tokens.md),
[verification.md](verification.md), [performance.md](performance.md).

## Adding a component (the recipe)

1. **Tokens first** — need a new visual value? It starts in `packages/tokens/tokens.json`
   (all three themes if it's a role). Usually you don't: the frozen scale already covers it.
2. **Stylesheet** — `packages/ui/styles/<area>.css`, classes rooted `.ui-*`. The build
   **auto-discovers** any new `.css` file and appends it after the known cascade order — zero
   build edits unless cascade order matters. Density via `calc(<px> * var(--ui-density))` plus
   `--compact`/`--dense` modifiers.
3. **Component** — `packages/ui/src/components/<Name>.tsx`: `forwardRef`, destructure props,
   `cx('ui-x', variant/density classes, className)`, spread `...rest`, default to the native
   element, guard `typeof window/document === 'undefined'` for any DOM access.
4. **Export** from `src/index.ts` — the API is consumer surface; changes are additive only.
5. **Checks** — interaction checks in `scripts/verify.mjs`, render it in
   `scripts/sample-screen.mjs` so it flows through the browser suites (axe, layout, themes, 3
   engines × 2 viewports).
6. **Example** — show it in `apps/example/src/main.jsx` with states, densities, both themes.

## Adding a theme

A theme is a role→primitive mapping ([theming.md](theming.md)): add the identical 22-role set to
`tokens.json` (every role a `{primitive.reference}`), rebuild, extend
`scripts/check-contrast.mjs`, add the name to the `ThemeName` union. No component changes. The
build fails on role-set divergence — never weaken it.

## Adding a structural value

Spacing, radius, type, elevation changes are **architecture decisions** (ADR-001): propose in
`DECISIONS.md` first, then extend the scale. The README change-guide maps every knob:

| To change… | Edit |
|---|---|
| Brand/semantic colours | `tokens.json → color` |
| Space/radius/type/elevation | `tokens.json → space / radius / font / elevation` |
| Density | `tokens.json → density` |
| Whether motion exists | `tokens.json → motion.enabled` (keep `false` for v1) |
| A component's look | `packages/ui/styles/<area>.css` |
| A component's API/behaviour | `packages/ui/src/components/<Name>.tsx` |
| Example content | `apps/example/src/main.jsx` |
| What "correct" means | `scripts/verify.mjs`, `scripts/verify-example.mjs` |

## Rule zero: every rule gets a gate

When you add a convention, add its check **in the same change** — `check-style.mjs` for CSS,
`check-contrast.mjs` for new colour pairs, `verify.mjs` for interaction, `check-contract.mjs`
for package promises. If a rule genuinely can't be gated, record it in
[STATUS.md](../STATUS.md) as ungated so it stays visible. A rule without a gate rots; and never
weaken a gate to make a change pass — invariant 9 calls that the one unrecoverable mistake in
this repo.

## Verification loop

Agents follow the **verification ladder** in [AGENTS.md](../AGENTS.md) (run only what the change
class requires; when unsure, `npm run ci`). For a multi-area human change, the full chain is:

```
npm run build && npm run check:contrast && npm run check:style && npm run verify
npm run example:build && npm run verify:example    # anything touching the examples
npm run verify:browser                             # anything touching styles, layout, focus
```

Commits carry evidence — numbers, check counts, the command that produced them
(CONTRIBUTING § 7). Conventional prefixes, one concern per commit, ≤ 72-char subject.

## What's next (from STATUS.md)

- **Visual regression**: shipped (ADR-005) — the suite pixel-compares against the committed,
  read-only `baselines/<platform>/` sets and never overwrites them (PRs #8/#9, #23).
- **Phase 2 components**: `Menu`, `Popover`, `Tooltip` and the listbox `Select` all shipped
  (#17, #24, #25); the `useTicks` coalescing helper is what remains (issue #7).
- Density, theme splitting, component tokens, icons, motion, publishing: the fuller roadmap was
  produced during the build; the two items above are what unblock the rest.

## Where decisions live

`DECISIONS.md` records every settled ADR — frozen scale, zero dependencies, static CSS +
attribute theming, motion off — each with its reasoning and (where applicable) an explicit
revisit criterion. **Supersede, don't edit**: if an ADR is wrong, a new entry replaces it with
the reasoning; the history stays auditable. If your task conflicts with an ADR, stop and surface
the conflict — don't work around it.
