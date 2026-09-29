// SPDX-License-Identifier: MIT OR Apache-2.0

// The count aggregate, plus the measured sizes, in one read-point.
//
// **A count is not declared here.** Each suite owns its total in `scripts/counts/<key>.mjs`, beside the
// checks it counts, so adding or removing a check edits exactly one file — the suite's own — and never
// this one. That matters under concurrency: four PRs in one afternoon each needed a hand edit to a
// single shared literal here, and the resulting rebases were pure friction (one sat conflicting for
// eleven hours).
//
// This module aggregates those declarations so the docs check and the prose keep one read-point, and
// each suite still asserts its own run against its own declaration — a check added without bumping the
// number still fails, it just fails in the file that changed. The import structure is the gate: a
// missing count file fails to resolve, and a stray one is simply not aggregated.
//
// The browser suite stays different: it computes its total structurally (checks per combo x engines x
// viewports) and answers `--print-counts` instead.
import { EXPECTED_COUNTS as contract } from './counts/contract.mjs';
import { EXPECTED_COUNTS as style } from './counts/style.mjs';
import { EXPECTED_COUNTS as verify } from './counts/verify.mjs';
import { EXPECTED_COUNTS as trading } from './counts/trading.mjs';
import { EXPECTED_COUNTS as pack } from './counts/pack.mjs';
import { EXPECTED_COUNTS as release } from './counts/release.mjs';
import { EXPECTED_COUNTS as consumer } from './counts/consumer.mjs';
import { EXPECTED_COUNTS as consumerTrading } from './counts/consumer-trading.mjs';
import { EXPECTED_COUNTS as support } from './counts/support.mjs';
import { EXPECTED_COUNTS as sizes } from './counts/sizes.mjs';

export const EXPECTED_COUNTS = {
  ...contract,
  ...style,
  ...verify,
  ...trading,
  ...pack,
  ...release,
  ...consumer,
  ...consumerTrading,
  ...support,
  ...sizes
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
    bytes: 3761,
    budget: 8000,
    budgetLabel: '8 kB',
    docs: { 'docs/verification.md': 'Stylesheet (all components)', 'STATUS.md': 'Stylesheet' }
  }
};

export const formatSize = (bytes) => (bytes >= 1000 ? `${(bytes / 1000).toFixed(2)} kB` : `${bytes} B`);
