// SPDX-License-Identifier: MIT OR Apache-2.0

// The documented figures the suites and the docs are both held to, in one place.
//
// Each suite asserts its own total against this module on every run, so adding or removing a check
// without updating the number fails that suite in CI. `scripts/check-docs-links.mjs` reads the same
// module to keep README and docs/verification.md honest against it.
//
// Only the browser suite can compute its total structurally (checks per combo x engines x viewports),
// so it keeps `--print-counts`; these are declarations, each enforced by the suite that owns it.
// Before this, only the browser suite's totals were gated and three docs drifted: verify 39 vs 69,
// check:style 97 vs 128, verify:example-trading 26 vs 28 (issue #31).
export const EXPECTED_COUNTS = {
  verify: 68,
  style: 141,
  trading: 28,
  pack: 9,
  sizes: 20
};

// The measured sizes, declared once. `scripts/check-size-claims.mjs` re-measures them on every run and
// asserts both that the build still matches and that every document stating a measured size quotes
// these values — the doc half is the point: four documents restated the sizes as prose and drifted
// three different ways while every gate stayed green.
//
// `formatSize` is shared with that script, so a number cannot be written one way in the build and
// another in the prose. `bytes` is what size-limit reports; the budget is the documented ceiling.
// `docs` names the row each document states the figure in — the check matches that row, not the file,
// so a cell that drifts while the same number survives in the prose still fails. `budgetLabel` is how
// a document spells the budget; the comparison uses `budget`.
export const EXPECTED_SIZES = {
  esmFull: {
    entry: '@trade/ui ESM, full surface (consumer cost, min+gzip)',
    bytes: 6185,
    budget: 7000,
    budgetLabel: '7 kB',
    docs: { 'docs/verification.md': 'ESM, full surface', 'STATUS.md': 'ESM bundle (as a consumer ships it)' }
  },
  esmButton: {
    entry: '@trade/ui ESM, Button only (consumer cost, min+gzip) — tree-shaking guard',
    bytes: 622,
    budget: 1500,
    budgetLabel: '1.5 kB',
    docs: { 'docs/verification.md': 'ESM, `Button` only — tree-shaking guard', 'STATUS.md': 'Single-component import (`Button`)' }
  },
  cjsFull: {
    entry: '@trade/ui CJS, full surface (consumer cost, min+gzip)',
    bytes: 6656,
    budget: 7500,
    budgetLabel: '7.5 kB',
    docs: { 'docs/verification.md': 'CJS, full surface' }
  },
  stylesheet: {
    entry: '@trade/ui stylesheet (gzip, all components)',
    bytes: 3757,
    budget: 8000,
    budgetLabel: '8 kB',
    docs: { 'docs/verification.md': 'Stylesheet (all components)', 'STATUS.md': 'Stylesheet' }
  }
};

export const formatSize = (bytes) => (bytes >= 1000 ? `${(bytes / 1000).toFixed(2)} kB` : `${bytes} B`);
