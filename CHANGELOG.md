# Changelog

All notable changes to `@trade/ui` and `@trade/tokens` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`npm run check:release` refuses to cut a release whose version has no section here, so an entry is a
precondition of publishing, not a courtesy.

## [Unreleased]

_Nothing yet._

## [0.1.0] — unreleased

The first release. Not yet published to the registry.

### Added

- **14 components** — `Button`, `DataTable`, `Dialog`, `Menu`, `Popover`, `Select`, `Input`, `Field`,
  `SelectionControls` (checkbox, radio, switch), `Stack`, `Tabs`, `Feedback` (banner, toast),
  `ThemeProvider`, `Tooltip` — plus the `useTicks` tick-coalescing hook.
- **A three-tier token system** (`@trade/tokens`): primitives → theme roles → components, with light,
  dark and high-contrast themes, and density scales (`1 / 0.75 / 0.625`).
- **Logical-properties CSS**: direction is declared with the `dir` attribute and layout follows it, so
  RTL is a document attribute rather than a second stylesheet.
- **A verification suite**: 69 library checks, 141 CSS checks, 90 browser checks across Chromium,
  Firefox and WebKit × desktop and mobile, a packaging contract, a consumer contract, a licence
  contract, 69/69 contrast pairs, a perf-retry policy, and a size gate that measures consumer cost.

### Known limitations

- No virtualizer — `DataTable` is virtualizer-friendly (`rowCount` keeps ARIA honest) so consumers
  plug in their own.
- Not yet used by a real application. The published surface is verified from a real tarball install
  (`npm run verify:consumer`), but no external consumer has exercised it.
- The supported browser floor is not yet stated; see the open issue for the matrix.
