# Design tokens

Deep dive on the token system behind `@trade/ui`. For how to consume the library read the root
`README.md`; for the rules of changing it read `CONTRIBUTING.md`; for why the scale is frozen read
`DECISIONS.md` (ADR-001). Sibling guides: [theming.md](theming.md) covers how themes consume these
tokens at runtime; [css.md](css.md) covers how components read them.

## The one rule

`packages/tokens/tokens.json` is **the only place raw values live**. Components never contain a
hex, an `rgb()`, a literal `z-index`, a hand-written shadow or a literal font size — they read
`var(--ui-*)`. This is executable: `scripts/check-style.mjs` fails any hand-written stylesheet that
violates it.

## The three tiers

The build (`packages/tokens/build-tokens.mjs`) compiles `tokens.json` into two artifacts —
`dist/tokens.css` and `dist/tokens.ts` — and its banner names the pipeline:

```
primitive -> theme role -> component
```

| Tier | What it is | Emitted as | Example |
|---|---|---|---|
| **primitive** | raw values we own | `--ui-ref-*` | `--ui-ref-indigo-500: #3f51b5` |
| **theme role** | a role mapped to a primitive *by reference* | `--ui-<role>` | `--ui-primary: var(--ui-ref-indigo-500)` |
| **structural** | theme-less scale values | `--ui-space-*`, `--ui-font-*`, … | `--ui-space-3: 12px` |

Roles referencing primitives — never literals — is what makes retheming a one-line change:
override a single `--ui-ref-*` and every role that points at it follows.

## Frozen scales

ADR-001: the scale is owned and versioned in this repo, frozen, and does not track upstream. The
initial values were derived from Material Design 2 at project start; the derivation is recorded for
explainability only. Extending a scale is an architecture decision, not a drive-by diff.

**Colour — neutral** (20 steps): `0 #ffffff` through `1000 #000000`, including non-round steps
(`25`, `35`, `150`, `750`, `850`, `875`) that exist to make the exact role mappings work.

**Accents** (3–4 steps each): indigo, teal, green, red, amber, blue — e.g. indigo
`200 #9fa8da / 500 #3f51b5 / 700 #303f9f`.

**Alpha**: `scrim` (light `rgba(0,0,0,.48)`, dark `.62`, high-contrast `.80`) and `hover`.

**Space** (9 steps): `0, 4, 8, 12, 16, 24, 32, 48, 64` px as `--ui-space-0…8`.

**Radius**: `sm 2px, md 4px, lg 8px, pill 999px`.

**Type**: sizes `xs 11, sm 12, md 14, lg 16, xl 20, 2xl 24` px with matching line heights;
families `--ui-font-family` (system stack) and `--ui-font-numeric` (monospace, for prices).

**Elevation** (7 steps `0–24`) and **z-index** (`--ui-z-dropdown 1000` … `--ui-z-toast 1070`).

**Motion**: `enabled: false` — the tokens exist but are inert (`--ui-transition: none`). See
ADR-004 and [css.md](css.md#motion).

**Density**: `comfortable: 1, compact: 0.75, dense: 0.625` — a first-class axis, not an
afterthought. See [css.md](css.md#density).

## Themes and roles

A theme is a **role → primitive mapping**. There are 21 roles per theme (`background`, `surface`,
`surface-1`, `rowAlt`, `onSurface`, `onSurfaceMuted`, `primary`, `onPrimary`, `secondary`,
`onSecondary`, `positive`, `negative`, `warning`, `error`, `onError`, `info`, `focusRing`,
`borderControl`, `outline`, `hoverOverlay`, `scrim`), identical across `light`, `dark` and
`high-contrast`. The build **fails hard** if a theme has an extra or missing role, or if a role is
a literal instead of a reference: `literalRolesInDefaultTheme: 0`.

The build verifies, per run: 44 primitive refs, 3 themes × 21 roles, 114 custom properties,
zero literal roles.

## The contrast contract

`scripts/check-contrast.mjs` enforces WCAG on the token *relationships*, theme by theme — not on
rendered pages, so unrendered states are covered too:

- **4.5:1** (WCAG 1.4.3 AA) for text roles: `onSurface`/`onSurfaceMuted` on each surface tier,
  `positive`/`negative` on `surface`/`rowAlt`, `primary`/`onPrimary`, `secondary`/`onSecondary`,
  `onError`/`error`.
- **3.0:1** (WCAG 1.4.11) for UI boundaries: `focusRing` on `surface`/`background`,
  `borderControl` on `surface`/`surface-1`/`background`.

That is 21 pair definitions × 3 fully-resolvable themes = **63 evaluations**, all passing. The
failure message says it all: *"Fix the token mapping, not the test."*

When you add a foreground/background combination to a component, add its pair to `PAIRS` in the
same change (AGENTS.md § Rule zero).

## Adding or changing a value

1. New visual value → `tokens.json` first. A new **role** goes into *all three themes in the same
   change*, each as `{primitive.reference}` — never a literal.
2. Rebuild: `npm run build` (runs `build-tokens.mjs`, which fails on dangling references or
   role-set divergence).
3. `npm run check:contrast` — the new mapping must clear WCAG.
4. Only then touch component CSS, which reads the new `var(--ui-*)`.

See [scaling.md](scaling.md) for the full change recipes and
[verification.md](verification.md) for how every one of these gates is wired into CI.
