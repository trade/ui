# CSS architecture

How the stylesheets are organised, what the authoring contract forbids, and how it's all compiled.
The contract is executable: `scripts/check-style.mjs` fails the build on any violation. Related:
[components.md](components.md) for the classes, [design-tokens.md](design-tokens.md) for the
values, [verification.md](verification.md) for the gate wiring.

## File layout

One hand-written file per area in `packages/ui/styles/` (11 files, ~444 lines total):

| File | Covers |
|---|---|
| `base.css` | reset, `.ui-root` typography/colours, the motion kill-switch, global `:focus-visible` ring, `.ui-visually-hidden` |
| `layout.css` | `.ui-stack` modifiers, `.ui-divider` |
| `button.css` | `.ui-btn` sizes, densities, 5 variants |
| `forms.css` | `.ui-field*`, `.ui-input`, `.ui-select`, `.ui-check`, `.ui-switch` |
| `table.css` | `.ui-table-wrap`, sticky thead, zebra rows, cell tones |
| `tabs.css` | tab list, `[aria-selected='true']` state, panel |
| `feedback.css` | `.ui-banner` tones, `.ui-toast(-region)` |
| `dialog.css` | scrim, dialog frame, header/body/footer |
| `menu.css` | `.ui-menu*` panel, items, separators |
| `popover.css` | `.ui-popover` non-modal anchored panel |
| `tooltip.css` | `.ui-tooltip` (no transition, by law) |

## The build

`packages/ui/build.mjs` step 3 requires `tokens/dist/tokens.css` to exist, then concatenates
**tokens.css + every styles file** into `dist/ui.css` under `/* --- file --- */` markers. Cascade
order comes from an explicit list (`base → layout → button → forms → table → tabs → feedback →
dialog`); **any other `.css` file in the directory is appended automatically** — new areas are
picked up with zero build edits unless cascade order matters. Each file is also copied verbatim to
`dist/components/` so consumers can import per-area for tree-shaking (ADR-003).

## The authoring contract

Ten checks per library stylesheet, nine per app stylesheet, in `scripts/check-style.mjs` (scope: hand-written
`packages/ui/styles/*.css` only — generated output is excluded):

1. **No raw colour literals** — no hex, `rgb()`/`hsl()`, `white`/`black`. Colour only via
   `var(--ui-*)`.
2. **No physical `left`/`right` properties** — `margin-left`, `padding-right`, `inset-right`,
   `text-align: left|right` are all banned. Use `inline-start`/`inline-end` — RTL flips for free.
   The codebase uses `border-inline-start` (banner tones), `inset-inline-end`/`inset-block-end`
   (toast region), `text-align: start/end` (numeric cells).

   Direction itself is declared with the **`dir` attribute**. That is what `:dir()` reflects, since
   it follows the document language's directionality rather than the CSS `direction` property — so a
   direction set only in CSS is outside the contract and no selector can observe it. The exception to
   "RTL flips for free" is a value with no logical equivalent: the tooltip pairs `inset-inline-start`
   with a *physical* centring transform, so the transform must flip with the direction, and it does so
   via `.ui-tooltip:dir(rtl)` — matched on the element, so an `ltr` island inside an `rtl` document
   keeps ltr geometry.
3. **z-index only via `var(--ui-z-*)`** — the stacking order is a tokened ladder
   (dropdown 1000 → toast 1070).
4. **box-shadow only via `var(--ui-elevation-*)`** — elevation is a scale, not a local decision.
5. **No animated transitions or animations** — the only legal value for `transition`/`animation`
   is `none`. See [Motion](#motion).
6. **No `!important`** — ever. Specificity is kept flat by design.
7. **font-size only via tokens or `inherit`** — the type scale is frozen (ADR-001).
8. **Classes are namespaced `.ui-*`** — every authored class starts with `ui-`.
9. **No vendor prefixes** beyond the single allowlist entry `-webkit-font-smoothing` in
   `base.css`.

`base.css` additionally carries the kill-switch `.ui-root, .ui-root * { transition: none;
animation: none; }` — so even a future slip is inert at runtime.

## Specificity

Flat, single-class selectors throughout. State comes from pseudo-classes and attribute selectors
(`.ui-btn:hover:not(:disabled)`, `.ui-tab[aria-selected='true']`), not from higher specificity.
Descendant selectors appear only for scoping (`.ui-root :focus-visible`, `.ui-field--error
.ui-input`). No `!important` exists anywhere, and the check keeps it that way.

## Density

Density is a CSS custom property multiplier, resolved entirely in the stylesheet — "token-backed,
no runtime maths in JS":

```css
.ui-btn--compact { --ui-density: var(--ui-density-compact); }  /* 0.75 */
.ui-btn--dense   { --ui-density: var(--ui-density-dense);  }   /* 0.625 */

.ui-btn--sm { padding: calc(4px * var(--ui-density)) calc(12px * var(--ui-density)); }
```

Root default is `--ui-density: 1` (comfortable). Components emit the modifier class only for
non-comfortable densities, and `calc(<px> * var(--ui-density))` does the rest — see
[components.md](components.md) for the prop side.

## Motion

ADR-004: **motion does not exist** in v1. The motion tokens (`short 100ms / medium 200ms / long
300ms`) are authored in `tokens.json` but inert — `motion.enabled: false` emits
`--ui-transition: none`, check 5 above bans any other value, and `base.css` kill-switches the
whole tree. Reduced-motion preferences are satisfied *by construction*, not by a media query. A
future opt-in entrypoint can use the tokens without breaking a single component.
