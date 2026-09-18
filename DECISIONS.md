# Architecture decisions

Decision records for `@trade/ui`. Each states the context, the decision and the consequences, so the
reasoning survives without anyone having to reconstruct it. Supersede an entry rather than editing it.

---

## ADR-001 — Own the token scale, frozen

**Status:** accepted

**Context.** The library needs a spacing rhythm, depth model and colour roles that suit dense,
data-heavy screens and survive both light and dark. Those values have to come from somewhere, and the
usual failure mode is a token set that quietly tracks an upstream specification and changes a
consumer's spacing out from under them.

**Decision.** The token system is owned and versioned in this repository. Spacing, elevation and
density steps are frozen and belong to this project; they do not track any upstream specification.

**Origin.** The initial values for the spacing rhythm (4/8/12/16/24/32…), the elevation ladder and the
density steps were derived at project start from Material Design 2. That upstream specification is no
longer maintained, and its later revision leans on expressive shape and motion, which conflicts with
this project's requirement to stay static. The derivation is recorded here only so the numbers are
explicable; nothing else is inherited. The naming, the roles and the mappings — `--ui-*`, `primary`,
`surface`, `borderControl`, `rowAlt` — are specific to this project.

**Consequences.**
- No consumer's spacing or colour changes because an upstream specification did.
- The scale is ours to extend; new roles are added by mapping to existing primitives.
- A faithful port of any other design system is explicitly out of scope. This is `UI`, not a port.
- Density is a first-class axis because the scale was chosen for dense data from the start.

---

## ADR-002 — Zero runtime dependencies; primitives are hand-rolled

**Status:** accepted

**Context.** The library targets workloads that re-render continuously, where any per-render work is
paid thousands of times a second. The genuinely hard accessibility controls — `Select`, `Menu`,
`Popover`, `Dialog` — could be borrowed from a headless library such as Base UI or Radix. That would
add one dependency and remove a large amount of work: focus trapping, listbox semantics, typeahead and
collision-aware positioning.

**Decision.** `@trade/ui` ships with no runtime dependencies. React and React DOM are peer
dependencies only. Those primitives are implemented in-house.

**Consequences.**
- Accessibility correctness for those controls is our responsibility, and is covered by executable
  checks: focus trap in both directions, roving tabindex, Home/End, ARIA grid semantics with honest
  row counts, and axe-core in both themes across three engines.
- The bundle stays small: the ESM build is ~4.3 kB gzip with no transitive weight.
- **Revisit criterion.** If maintaining these controls ever costs materially more than taking a
dependency would, the trade-off is reconsidered against measurements, not against impression. Until
that happens the dependency stays out.

---

## ADR-003 — Static CSS, theming by attribute

**Status:** accepted

**Context.** Runtime CSS-in-JS pays a style-serialization cost on every render, which is unacceptable
when table rows update continuously. Theme switching must also be cheap, because operators toggle it
during a session.

**Decision.** Styling is static CSS plus CSS custom properties. A theme is applied by setting
`data-theme` on `<html>`.

**Consequences.**
- A theme switch costs **zero React renders** and runs no style code; the browser re-resolves the
  custom properties itself.
- No styling engine ships, so there is nothing to run on the hot path.
- A theme is a role-to-primitive mapping, so adding one requires no component change.
- Stylesheets are static files, which tree-shake by import rather than by rule.

---

## ADR-004 — Motion is off by default

**Status:** accepted

**Context.** Animated transitions cost frame budget on a screen that is already re-rendering
continuously, and they add nothing for a user reading numbers. Motion should be available later
without being paid for now.

**Decision.** Motion tokens exist in the design system but are inert. No component authors a
transition or an animation.

**Consequences.**
- The core ships no animation; the only `transition` declarations in the stylesheet set `none`.
- A future opt-in entrypoint can consume the existing tokens without a breaking change to components.
- Reduced-motion preferences are satisfied by construction rather than by a media query.
