# Accessibility

Accessibility is not polish here — it is a gated contract. AGENTS.md invariant 10: keyboard paths,
`:focus-visible`, ARIA honesty, non-colour signalling, and **axe with zero violations in both
themes across three engines** before anything is called done. Related: [components.md](components.md)
for the APIs, [verification.md](verification.md) for the gates.

## Keyboard maps

Per-component, as implemented (and asserted by `scripts/verify.mjs`):

| Component | Keys | Behaviour |
|---|---|---|
| **Tabs** | `→` / `←` | move selection **and** focus, wrap around, skip disabled (roving tabindex) |
| | `Home` / `End` | jump to first / last tab |
| | `Tab` | one stop on the tablist, then into the panel (`tabIndex={0}`) |
| **Dialog** | `Escape` | closes (document-level listener) |
| | `Tab` / `Shift+Tab` | trapped: last→first and first→last wrap, via the `FOCUSABLE` selector |
| **DataTable** | `Tab` | scroll container is a tab stop; rows get tab stops with `focusableRows` |
| **Checkbox/Radio/Switch** | native | Space toggles; arrow keys across radio groups; Switch is `role="switch"` |
| **Select** | native | fully native `<select>` keyboard support, by design (ADR-002) |

Deliberate gap, documented: DataTable ships **no built-in arrow-key row navigation** — rows are
tab stops, nothing more. Phase 2 work.

## Focus management

- **Global ring** — `base.css` gives every focusable element a visible ring via
  `.ui-root :focus-visible { outline: 2px solid var(--ui-focus-ring); outline-offset: 2px; }`;
  table rows override with a negative offset so the ring hugs the row. `--ui-focus-ring` is one
  of the contrast-gated pairs (3.0:1, WCAG 1.4.11) — see [design-tokens.md](design-tokens.md).
- **Dialog** — on open it saves `document.activeElement`, focuses the dialog container itself
  (not the first control: focusing a control can surprise users on destructive dialogs), traps
  Tab both directions, and **restores focus to the trigger on close/unmount**.
- **`.ui-visually-hidden`** — classic clip-pattern utility for screen-reader-only text.

## ARIA honesty

The rule: **ARIA reflects the data, not the DOM.**

- `DataTable` renders `role="grid"` with `aria-rowcount={(rowCount ?? rows.length) + 1}` — the
  **+1 is the header row**, and `rowCount` is the *full dataset* size, not the window. A
  virtualized 200,000-row dataset with 60 rendered rows reports `aria-rowcount="200001"`, asserted
  verbatim by both `verify.mjs` (SSR, 5,000-row scale test) and `browser-suite.mjs` (live). Rows
  carry explicit `aria-rowindex` (header = 1, data rows = `rowOffset + i + 2`); cells are
  `role="gridcell"`, headers `role="columnheader" scope="col"`.
- **Tabs** — real `tablist`/`tab`/`tabpanel` with `aria-selected`, `aria-controls`,
  `aria-labelledby`; panels are `tabIndex={0}` so keyboard users can scroll them.
- **Forms** — `Field` auto-wires `id`, `aria-describedby` (error id takes priority over hint id)
  and `aria-invalid` onto its control; `Input`/`Select` preserve consumer-supplied
  `aria-describedby`; `Button` sets `aria-busy` while loading.
- **Feedback** — `Banner` and `Toast` are `role="status"`; `Toast` adds `aria-live="polite"`;
  `ToastRegion` is `role="region" aria-label="Notifications"`.

## Non-colour signalling

Direction is never colour-only: `Cell direction="up"|"down"` prefixes `▲`/`▼` glyphs alongside
the positive/negative tone, so red/green is redundant, not exclusive. Banner tones get a
`border-inline-start` accent, not just a colour. Verified by checks that assert the glyphs appear
in SSR markup.

## How it's gated

1. **axe-core, zero violations, both themes, every engine × viewport** — the browser suite runs
   axe in light (harness self-audit) and dark (`window.axe.run` after `__setTheme('dark')`) in
   chromium, firefox and webkit at desktop *and* mobile sizes. Any violation > 0 fails the gate.
2. **DOM interaction checks** — `scripts/verify.mjs` phase B asserts the keyboard maps above
   actually work (roving tabindex, Home/End, both focus-trap wrap directions, Escape).
3. **SSR markup checks** — ARIA grid semantics, honest row counts, direction glyphs, no inline
   transitions.
4. **Contrast contract** — all role pairs WCAG-cleared per theme before any browser runs:
   [design-tokens.md](design-tokens.md#the-contrast-contract).

Changing anything that affects interaction? `npm run verify` and `npm run verify:browser` are
mandatory before you call it done (AGENTS.md invariant 10).
