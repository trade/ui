# UI development guide

Deep documentation for working *on* `@trade/ui`. For what the library is and how to consume it,
read the root `README.md`. For the rules of changing this codebase, read `CONTRIBUTING.md` — this
guide explains the systems behind those rules.

| Guide | What it covers |
|---|---|
| [design-tokens.md](design-tokens.md) | The three-tier token model, naming, the frozen scales, density axis, contrast contract |
| [theming.md](theming.md) | How a theme works, zero-render switching, `color-scheme`, adding a theme |
| [components.md](components.md) | Component inventory, API conventions, prop patterns, per-component notes |
| [css.md](css.md) | The static CSS architecture: file layout, naming, specificity, logical properties |
| [accessibility.md](accessibility.md) | Keyboard maps, ARIA patterns, focus management, how accessibility is gated |
| [verification.md](verification.md) | Every gate, what it checks, how to add checks, measurement reliability, CI |
| [performance.md](performance.md) | Hot-path discipline, budgets, virtualization contract, scaling notes |
| [scaling.md](scaling.md) | How the codebase grows: adding components, themes, engines — without drift |

Order for a newcomer: tokens → theming → components → css → accessibility, then verification and
performance as needed. `scaling.md` is for planning multi-week additions.
