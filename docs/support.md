# Browser support

**Floor: Chrome 86 · Firefox 85 · Safari 15.4 (iOS 15.4).**

Above that line everything in the shipped stylesheets and library source works as authored. Below it,
specific things degrade — none of them silently break, but the list matters and is in
[What degrades below the floor](#what-degrades-below-the-floor).

The floor is not a preference. It is implied by what the library actually uses, and the feature that
sets it is `:focus-visible`, because it is the only one with **no fallback**: on an engine without it,
keyboard users get no focus ring at all (issue #39 tracks the pre-15.4 gap). Everything else is either
older than that floor or has a documented fallback.

## What sets it

Baselines from [mdn/browser-compat-data](https://github.com/mdn/browser-compat-data) (`main`, BCD
v8.1.3). The **bold** row is the binding one — the maximum across the features without a fallback
decides the floor.

| Feature | Where the library uses it | Chrome | Firefox | Safari |
|---|---|---|---|---|
| **`:focus-visible`** | focus rings in 5 stylesheets | **86** | **85** | **15.4** |
| dynamic viewport units (`dvh`) | `Dialog` max-height | 108 | 101 | 15.4 |
| `accent-color` | checkbox and switch | 93 | 92 | 15.4 (partial) · 26.2 (full) |
| `:dir()` | the tooltip's direction override | 120 | 49 | 16.4 |
| logical properties (`inset-inline`, `padding-block`, …) | 8 stylesheets | 87 | 63 | 14.1 |
| flex `gap` | 9 stylesheets | 57 | 52 | 10.1 |
| `@supports selector()` | the `:dir()` fallback | 83 | 69 | 14.1 |
| `position: sticky` | scroll containers, table headers | 56 | 32 | 13 |
| `text-size-adjust` (unprefixed) | `base.css` | 54 | — | — |
| JS: optional chaining, nullish coalescing | the ES2020 build target | 80 | 74 / 72 | 13.1 |
| `scrollbar-width` | **`apps/example-trading` only** | 121 | 64 | 18.2 |

Two rows deserve their notes:

- **`text-size-adjust` has no unprefixed implementation in Firefox or Safari.** The declaration in
  `base.css` is a defensive no-op there, not a dependency. The prefixed form would work, and the CSS
  authoring gate bans vendor prefixes on purpose — that tension is issue #40.
- **`scrollbar-width` is the example's, not the library's.** It appears only in
  `apps/example-trading/src/screen.css`, so the *example* has a later effective floor for a cosmetic
  scrollbar. The library ships nothing that depends on it.

## What degrades below the floor

| Below | What you lose | Why it is acceptable |
|---|---|---|
| Chrome 86 / Firefox 85 / Safari 15.4 | **the focus ring** — `:focus-visible` matches nothing | not acceptable, which is why this is the floor and not a degradation |
| Chrome 120 / Firefox 49 / Safari 16.4 | the tooltip's `:dir()` path; it falls back to `@supports not selector(:dir(rtl))` with an ancestor `[dir='rtl']` selector | the bubble still centres in a plain RTL document; **only an `ltr` island inside an `rtl` document is mis-centred** — a documented, accepted limitation |
| Chrome 108 / Firefox 101 / Safari 15.4 | exact dynamic viewport sizing; `Dialog` falls back to `vh` | the dialog is merely taller than the visible viewport by the browser-chrome height |
| Chrome 93 / Firefox 92 / Safari 26.2 | brand-coloured `accent-color` on checkbox and switch | they render with the platform accent — legible and correct, just not the brand colour |

## What the floor is not about

- **`forced-colors` (Windows High Contrast)** is an *environment* question, not a version question —
  it applies at every version, and the library has no handling for it yet (issue #44).
- **Touch target size** is a *pointer* question, not a version question; it matters on a phone with a
  modern browser (issue #45).
- **Safari itself is never exercised.** CI runs Playwright's WebKit build, not Safari
  (issue #60). This floor is stated from the features the library uses, and Playwright's WebKit
  is the closest available proxy — but it is a proxy, and this document does not claim otherwise.
- **Performance is not a floor.** The browser suite's p95 frame budgets are measured on the machines
  described in [performance.md](performance.md); nothing here says an old device will hit them.

## How this stays true

`npm run check:support` derives the floor from the feature registry in `scripts/check-support.mjs` and
holds this document to it:

1. every feature listed above is actually used by the shipped stylesheets or source,
2. every registered feature is named in this document,
3. the floor stated here **is** the maximum the shipped features imply — so the row that sets the floor
   cannot change without this line changing with it.

It knows only about the features it registers. If the stylesheets start using something newer, the gate
will not notice — adding a row to the registry is part of using a new feature, in the same way
`expected-counts.mjs` is part of adding a check.
