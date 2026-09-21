// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

// The documented check totals, in one place.
//
// Each suite asserts its own total against this module on every run, so adding or removing a check
// without updating the number fails that suite in CI. `scripts/check-docs-links.mjs` reads the same
// module to keep README and docs/verification.md honest against it.
//
// Only the browser suite can compute its total structurally (checks per combo x engines x viewports),
// so it keeps `--print-counts`; these three are declarations, each enforced by the suite that owns it.
// Before this, only the browser suite's totals were gated and three docs drifted: verify 39 vs 69,
// check:style 97 vs 128, verify:example-trading 26 vs 28 (issue #31).
export const EXPECTED_COUNTS = {
  verify: 73,
  style: 128,
  trading: 28
};
