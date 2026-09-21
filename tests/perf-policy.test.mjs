// Unit tests for the browser suite's perf-retry policy. These exercise the pure module directly
// (no browser), which is exactly why scripts/perf-policy.mjs was separated from the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_P95_FRAME_MS,
  MARGINAL_SLACK_MS,
  perfContext,
  perfGated,
  looksThrottled,
  overPerfBudget,
  marginalPerfOverBudget,
  tickingWithinBudget,
  staticWithinBudget,
  isBetterReading,
  needsRetry
} from '../scripts/perf-policy.mjs';

test('the perf budget and slack are pinned', () => {
  assert.equal(MAX_P95_FRAME_MS, 25);
  assert.equal(MARGINAL_SLACK_MS, 5);
});

test('exactly one engine is gated per platform', () => {
  assert.equal(perfGated('darwin', 'webkit'), true);
  assert.equal(perfGated('darwin', 'chromium'), false);
  assert.equal(perfGated('linux', 'webkit'), false);
  assert.equal(perfGated('linux', 'chromium'), true);
  assert.equal(perfGated('win32', 'firefox'), true);
});

test('the budget boundary is inclusive', () => {
  const ctx = perfContext('linux', 'chromium');
  assert.equal(tickingWithinBudget({ p95: 25, staticP95: 10 }, ctx), true);
  assert.equal(tickingWithinBudget({ p95: 26, staticP95: 10 }, ctx), false);
  assert.equal(staticWithinBudget({ p95: 10, staticP95: 25 }, ctx), true);
  assert.equal(staticWithinBudget({ p95: 10, staticP95: 26 }, ctx), false);
});

test('informational engines always pass their gates', () => {
  const ctx = perfContext('linux', 'webkit'); // webkit is informational off macOS
  assert.equal(tickingWithinBudget({ p95: 999, staticP95: 999 }, ctx), true);
  assert.equal(staticWithinBudget({ p95: 999, staticP95: 999 }, ctx), true);
});

test('throttle-looking readings are recognised', () => {
  assert.equal(looksThrottled({ p95: 101, staticP95: 10 }), true);
  assert.equal(looksThrottled({ p95: 10, staticP95: 101 }), true);
  assert.equal(looksThrottled({ p95: 10, staticP95: 100 }), false);
  assert.equal(looksThrottled({ p95: 10, staticP95: Number.NaN }), true, 'a missing static reading is throttled');
});

test('overPerfBudget covers both readings', () => {
  assert.equal(overPerfBudget({ p95: 26, staticP95: 10 }, 25), true);
  assert.equal(overPerfBudget({ p95: 10, staticP95: 26 }, 25), true);
  assert.equal(overPerfBudget({ p95: 25, staticP95: 25 }, 25), false);
});

test('a marginal reading is only marginal on a gated engine', () => {
  const gated = perfContext('linux', 'chromium');
  const informational = perfContext('linux', 'webkit');
  const reading = { p95: 28, staticP95: 20 }; // 28 ∈ (25, 30]
  assert.equal(marginalPerfOverBudget(reading, gated), true);
  assert.equal(marginalPerfOverBudget(reading, informational), false);
  assert.equal(marginalPerfOverBudget({ p95: 31, staticP95: 20 }, gated), false, 'past the band is not marginal');
});

test('a re-measure is triggered for throttled, marginal, or overloaded-host readings', () => {
  const ctx = { ...perfContext('linux', 'chromium'), hostOverloaded: false };
  assert.equal(needsRetry({ p95: 150, staticP95: 20 }, ctx), true, 'throttled');
  assert.equal(needsRetry({ p95: 28, staticP95: 20 }, ctx), true, 'marginal on a gated engine');
  assert.equal(needsRetry({ p95: 20, staticP95: 20 }, ctx), false, 'within budget');

  const overloaded = { ...perfContext('linux', 'chromium'), hostOverloaded: true };
  assert.equal(needsRetry({ p95: 40, staticP95: 20 }, overloaded), true, 'over budget while the host is thrashing');
  assert.equal(needsRetry({ p95: 40, staticP95: 20 }, ctx), false, 'over budget but the host looks healthy -> fail honestly');
});

test('isBetterReading prefers an unthrottled, in-budget attempt', () => {
  const ctx = perfContext('linux', 'chromium');
  assert.equal(isBetterReading({ p95: 150, staticP95: 20 }, { p95: 20, staticP95: 20 }, ctx), true, 'unthrottled beats throttled');
  assert.equal(isBetterReading({ p95: 20, staticP95: 20 }, { p95: 150, staticP95: 20 }, ctx), false, 'throttled never beats unthrottled');

  // The other replacement path: neither reading is throttled, but one is over budget on a gated
  // engine, so the in-budget retry must win - otherwise a failing reading is kept.
  const overBudget = { p95: 26, staticP95: 20 };
  const inBudget = { p95: 20, staticP95: 20 };
  assert.equal(isBetterReading(overBudget, inBudget, ctx), true, 'a gated engine replaces an over-budget reading with an in-budget retry');
  assert.equal(
    isBetterReading(overBudget, inBudget, perfContext('linux', 'webkit')),
    false,
    'an informational engine does not make that replacement'
  );
});
