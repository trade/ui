# Theming

How theming works in `@trade/ui`: one static stylesheet, one attribute on `<html>`, zero React
renders. Settled by [DECISIONS.md](../DECISIONS.md) **ADR-003** — treat it as binding. Related
guides: [design-tokens.md](design-tokens.md) defines the roles being themed; [css.md](css.md)
covers the stylesheet that carries them.

## A theme is a mapping, not a stylesheet

Every theme — `light`, `dark`, `high-contrast` — is a **role → primitive reference** mapping in
`packages/tokens/tokens.json`. The build emits each one as a block of `--ui-*` custom properties.
Components only ever read role variables, so they have no idea themes exist:

```css
:root                     { --ui-primary: var(--ui-ref-indigo-500); color-scheme: light dark; }
[data-theme="dark"]       { --ui-primary: var(--ui-ref-indigo-200); color-scheme: dark; }
[data-theme="high-contrast"] { --ui-primary: var(--ui-ref-indigo-700); color-scheme: light; }
```

Consequences:

- **Adding a theme touches no component code.** Add a role set to `tokens.json`, rebuild, extend
  `check-contrast.mjs`. Done.
- **The cascade does the switching.** The browser re-resolves custom properties when the
  attribute flips; no JavaScript style engine, no CSS-in-JS, no re-serialization.

## Switching themes: one attribute write

The exported `setThemeAttribute(theme)` (`packages/ui/src/components/ThemeProvider.tsx`) writes or
removes `data-theme` on `document.documentElement`:

- `'dark'` → sets `data-theme="dark"`
- `'light'`/`'high-contrast'` → sets the matching attribute
- `'system'` → **removes** the attribute

It is SSR-guarded (no-op when `document` is undefined) and performs **no React render and no
style code** — measured cost of a theme switch: **0 React renders** (asserted by
`scripts/verify.mjs`). The compiled CSS also carries a
`@media (prefers-color-scheme: dark) { :root:not([data-theme]) { … } }` block, so with no
attribute set the page follows the OS.

## ThemeProvider and useTheme

```tsx
<ThemeProvider theme="light">        // 'light' | 'dark' | 'high-contrast' | 'system' (default)
  <Button onClick={() => setTheme('dark')} />
</ThemeProvider>
```

- Context value: `{ theme, resolved, setTheme }`. `resolved` collapses `'system'` to the OS value
  and **tracks it live** via a `matchMedia('(prefers-color-scheme: dark)')` listener — canvases,
  charts and third-party widgets that read `resolved` paint the right theme even while the OS
  changes under them.
- The provider wraps children in `<div class="ui-root" data-ui-theme={theme}>`. Note the two
  attributes: `data-theme` lives on `<html>` (written by `setThemeAttribute`, read by the CSS),
  `data-ui-theme` mirrors the requested name on the provider's wrapper for app-level hooks.
- `useTheme()` outside a provider throws deliberately — silent defaults have cost people
  half-day debugging sessions before.

## `color-scheme` follows the theme

The build sets `color-scheme` per block (`dark` for dark, `light` for high-contrast, `light dark`
at root) so **native controls render for the same polarity the roles do** — select arrows,
scrollbars, form glyphs. This was a fixed bug, not an accident; see the commit history
(`fix(tokens): dark theme roles reference primitives; color-scheme follows the theme`).

## Adding a theme

1. Add a `themes.<name>` object to `packages/tokens/tokens.json` with the **identical 21-role
   set**, every role a `{primitive.reference}` — no literals, no extra or missing roles. The
   build fails on divergence; do not weaken it.
2. `npm run build` — the emitter generates the `[data-theme="…"]` block and picks `color-scheme`
   per its rules.
3. Extend `scripts/check-contrast.mjs` in the same change so the new theme's pairs are gated
   (AGENTS.md § Rule zero).
4. Add the name to the `ThemeName` union in `ThemeProvider.tsx` (currently a hardcoded union of
   `light | dark | high-contrast | system`).

Everything else — components, stylesheets, demo — follows automatically.
