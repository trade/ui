# Components

The component inventory and the API conventions every component follows. Sources of truth:
`packages/ui/src/components/` and the public surface `packages/ui/src/index.ts`. Conventions:
[css.md](css.md) for the stylesheet side, [accessibility.md](accessibility.md) for keyboard and
ARIA behaviour, [scaling.md](scaling.md) for the recipe to add one.

## API conventions (every component, no exceptions)

- **`forwardRef`** — all ref-accepting components forward to their native element. (The
  exceptions are components with no meaningful native ref: `Stack`, `Field`, `DataTable`, `Tabs`,
  `Dialog`, `Feedback`, `ThemeProvider`.)
- **`cx()`** — the 4-line helper in `src/internal/cx.ts` joins truthy class parts. Variants,
  sizes and densities are *classes*, never inline style objects.
- **`...rest` spread** — props are destructured, the rest spread onto the native element so
  consumers keep full HTML control.
- **Native first** — the least-opinionated native element: `Select` is a real `<select>`,
  selection controls are real `<input>`s. ARIA honours the data (`aria-rowcount` = data length,
  not DOM length).
- **SSR-safe** — any DOM access is guarded by `typeof window/document === 'undefined'`; `Dialog`
  renders inline during SSR instead of portalling.
- **Density as a prop** — `'comfortable' | 'compact' | 'dense'`, emitted as a modifier class only
  when set *and* not `comfortable` (comfortable is the CSS default). See [css.md](css.md#density).

## The inventory

### Layout

**`Stack`** — `direction='column'`, `gap=3` (token step 0–8, applied as
`gap: var(--ui-space-${gap})`), `align`, `justify`, `wrap`, `grow`. Classes `.ui-stack` +
`--row`/`--column`/`--wrap`/`--grow`.

### Actions

**`Button`** — `variant`: `primary | secondary | outline | ghost | danger`; `size`:
`sm | md | lg`; `density`; `fullWidth`; `loading` (sets `disabled` + `aria-busy`, class
`--loading`). `type` defaults to `'button'`, not the HTML `'submit'`. No ripple, no transition —
state changes are one paint.

### Forms

**`Input`** — `numeric` right-aligns tabular figures via `--ui-font-numeric` (prices, quantities,
P/L); `invalid` sets `aria-invalid`; preserves a consumer-supplied `aria-describedby` explicitly.

**`Select`** — `options: {value, label, disabled?}[]`, optional `placeholder` rendered as an
empty-value `<option>`. v1 is **native-select backed on purpose**: dependency-free, fully
accessible, consistent across browsers (ADR-002). A listbox Select is Phase 2 (see
[STATUS.md](../STATUS.md)).

**`Field`** — wraps exactly one control and auto-wires it: generates an id (`ui-field-<useId>`),
clones the child with `id`, `aria-describedby` (error id wins over hint id) and
`aria-invalid` when there's an error; renders `<label htmlFor>`, then error span, then hint.

**`Checkbox` / `Radio` / `Switch`** — native `<input>` in a `<label>`; `Switch` is
`type="checkbox" role="switch"`. Styled via `accent-color: var(--ui-primary)`; check/radio 16×16,
switch 36×20. Disabled state lives on the label (`ui-check--disabled`, reused by all three).

### Data

**`DataTable<T>`** — the core component. Props: `columns` (`{key, header, width?, numeric?,
align?, render?}`), `rows`, `getRowKey`, `density`, `caption`, `emptyMessage='No data'`,
`focusableRows`, `onRowClick`, and the virtualization contract: `rowCount` (full dataset size,
drives honest `aria-rowcount`), `rowOffset` (index of the first supplied row), `rowHeight`.
When `rowCount > rows.length` and a `rowHeight` is set, `aria-hidden` spacer rows reserve the
missing space — the library renders the window you give it and keeps ARIA honest; it ships no
virtualizer, consumers plug in their own. See [performance.md](performance.md).

**`Cell`** — table cell helper: `numeric`, `tone: 'positive' | 'negative'`, and
`direction: 'up' | 'down'` which prefixes `▲`/`▼` — **direction is never colour-only**.

### Navigation

**`Tabs`** — controlled (`value`/`onChange`) or uncontrolled (`defaultValue`, defaults to the
first key). Roving tabindex over `role="tablist"`; arrow keys move selection **and** focus and
wrap, skipping disabled items; `Home`/`End` jump to the ends. See
[accessibility.md](accessibility.md#keyboard-maps).

### Overlays and feedback

**`Dialog`** — `open`, `onClose`, required `title`, `footer`, `closeLabel='Close'`. Portals to
`document.body` in the browser, renders inline under SSR. On open it saves and focuses itself
(not the first control — focusing a control can surprise users on destructive dialogs) and traps
Tab in both directions; Escape closes; scrim mousedown closes only on the scrim itself; on close
the previously focused element is restored. No entry/exit animation, by design (ADR-004).

**`Banner`** — `tone: 'info' | 'success' | 'warning' | 'danger'`, `role="status"`, tone accent is
a `border-inline-start`, never colour alone.

**`Toast` / `ToastRegion`** — toasts are `role="status" aria-live="polite"` inside
`role="region" aria-label="Notifications"`. Deliberately **no auto-dismiss timer and no entry
animation** in v1.

### Theming

**`ThemeProvider` / `useTheme` / `setThemeAttribute`** — see [theming.md](theming.md).

## Class naming

BEM-flavoured, `ui-` namespaced (enforced by `check-style.mjs`):

- Block: `.ui-btn`, `.ui-input`, `.ui-table`, `.ui-dialog`
- Element: `.ui-dialog__header`, `.ui-table__caption`
- Modifier: `.ui-btn--primary`, `.ui-input--numeric`, `.ui-table--dense`
- **State via attributes, not classes**: `.ui-tab[aria-selected='true']`,
  `tr[data-focusable='true']:focus-visible`, `.ui-tabs__panel[hidden]` — the DOM states the truth.

The full export list lives in `packages/ui/src/index.ts`; names are consumer surface — changes
are additive only (AGENTS.md invariant 8).
