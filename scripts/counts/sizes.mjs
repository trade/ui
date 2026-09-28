// SPDX-License-Identifier: MIT OR Apache-2.0

// The total `scripts/check-size-claims.mjs` runs, declared beside the checks it counts. (The measured
// sizes themselves are data, not counts, and live in `scripts/expected-counts.mjs`.)
//
// A count lives with its suite so that adding a check edits exactly one file — the suite's own — and
// never the shared aggregate. `scripts/expected-counts.mjs` imports every one of these, so the docs
// check and the prose still read from one place.
export const EXPECTED_COUNTS = { sizes: 20 };
