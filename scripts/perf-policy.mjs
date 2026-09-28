// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * @trade/ui - perf-retry policy for scripts/browser-suite.mjs.
 *
 * The browser suite measures frame cadence on hosts it does not control. A shared macOS CI runner
 * twice read a 57.9% dropped-frame ratio (no real hardware produces that) and, on the same run, a
 * gated WebKit reading of 34 ms; the identical commit also read 26 ms and then passed. Those are
 * host wobble, not regressions, and a gate that flips on them is worse than no gate.
 *
 * These are the rules that decide when a reading is re-measured, kept pure and browser-free so
 * scripts/check-perf-policy.mjs can exercise every branch deterministically (Rule zero: a policy
 * without a gate rots).
 *
 * Nothing here moves a threshold. The budget is supplied by the caller (the suite's
 * T.maxP95FrameMs), and check-perf-policy.mjs pins that value so loosening it cannot happen
 * silently.
 */

// The knobs themselves live here too, so the budget a verdict ENFORCES and the budget the report
// DECLARES cannot drift apart: the suite builds its context with perfContext() and writes
// T.maxP95FrameMs from MAX_P95_FRAME_MS. (An earlier revision pinned only the declaration, and
// doubling the context budget passed every check - Greptile P2 on #33.)
export const MAX_P95_FRAME_MS = 25;
export const MARGINAL_SLACK_MS = 5;
export const HOST_OVERLOAD = { droppedRatio: 0.25, staticP95Ms: 40 };

// The interval a 60 Hz display asks for, and how close a reading must sit to a multiple of it to
// count as a cadence lock.
export const FRAME_MS = 1000 / 60;
export const CADENCE_TOLERANCE_MS = 2.5;

// Starvation signature. When the host is CPU-starved the paint still fits inside a frame (the static
// reading stays healthy) but the ticking render loop does not, so every rAF callback overruns and
// the cadence halves to a hard 30 Hz - a p95 sitting on 2x the frame interval (33.3 ms). A genuine
// library regression looks different: it degrades the static reading too, and does not land on an
// exact multiple of the frame interval. Seen on both a loaded Windows host (Firefox) and a 4-CPU
// Docker VM (Chromium + Firefox) with the identical commit, so it is the host, not the code.
export const looksCadenceLocked = (r) =>
  Number.isFinite(r.p95) &&
  Number.isFinite(r.staticP95) &&
  r.staticP95 <= MAX_P95_FRAME_MS &&
  Math.abs(r.p95 - FRAME_MS * 2) <= CADENCE_TOLERANCE_MS;

// Degraded static paint is deliberately NOT a retry trigger (observed: a healthy 16.7 ms ticking reading
// with a 29-33 ms static one on Firefox, while Chromium read 16.7/16.7). Static degradation is the
// regression signature this policy relies on - a real regression degrades the static reading too - and
// because isBetterReading swaps an over-budget gated reading for any in-budget retry, re-measuring it would
// let one lucky quieter attempt mask a real paint regression. The 25-30 ms slice is already retried by the
// marginal band, so such a rule would not move the pass threshold - staticWithinBudget still compares the
// retained reading to 25 ms - it would only give more over-budget readings another attempt, and an attempt
// that landed in budget would be kept. The operational answer is to gate perf on a pinned container or a
// dedicated host, not to loosen this one.
export const perfContext = (platform, engineName) => ({
  platform,
  engineName,
  budgetMs: MAX_P95_FRAME_MS,
  slackMs: MARGINAL_SLACK_MS
});

// A reading this bad means the browser was throttled, not that the library is slow.
export const looksThrottled = (r) => !Number.isFinite(r.staticP95) || r.staticP95 > 100 || r.p95 > 100;

// Perf gates on some hosts/engines and is informational on others. On macOS the shared runner cannot
// hold Chromium to these thresholds (its static p95 read 50 ms on a healthy run), while Playwright's
// WebKit is a port everywhere else. Exactly one engine is gated per platform.
export const perfGated = (platform, engineName) =>
  platform === 'darwin' ? engineName === 'webkit' : engineName !== 'webkit';

export const overPerfBudget = (r, budgetMs) => r.p95 > budgetMs || r.staticP95 > budgetMs;

// A gated reading within the slack band is far more likely to be host wobble than a regression: a
// real regression reads 30-40 ms with a rising dropped-frame ratio while the other engines stay
// healthy. Past the band the reading is accepted as-is and fails.
export const marginalPerfOverBudget = (r, { platform, engineName, budgetMs, slackMs }) =>
  perfGated(platform, engineName) &&
  overPerfBudget(r, budgetMs) &&
  r.p95 <= budgetMs + slackMs &&
  r.staticP95 <= budgetMs + slackMs;

// Which of two attempts to keep: an unthrottled reading beats a throttled one, and on a gated engine
// a reading inside the budget beats one outside it. Only ever called with two real readings.
export const isBetterReading = (current, candidate, { platform, engineName, budgetMs }) =>
  (looksThrottled(current) && !looksThrottled(candidate)) ||
  (perfGated(platform, engineName) && overPerfBudget(current, budgetMs) && !overPerfBudget(candidate, budgetMs));

// After a combo reads this badly the host itself is suspect for the rest of the run - on a shared
// runner the whole box thrashes together. A genuine single-engine regression looks the opposite way
// (the failing engine degrades while the others stay healthy), so this cannot mask one.
//
// A cadence lock is deliberately NOT an overload signal. It is decided per combination by
// needsRetry, and latching it here would make one starved combination lengthen every later one for
// no benefit: a persistent tick-only regression still fails its own gate, so the run just pays
// extra retries and backoff.
export const isOverloadSignal = (r, { droppedRatio, staticP95Ms }) =>
  Boolean(r) && (r.droppedRatio > droppedRatio || r.staticP95 > staticP95Ms);

// The gated verdicts the suite prints. Routing them through here (rather than an inline
// comparison in the suite) is what lets scripts/check-perf-policy.mjs exercise the 25 ms boundary
// itself: a gate that pins only the literal budget cannot see the comparison being loosened.
// Informational engines always pass.
export const tickingWithinBudget = (r, ctx) =>
  !perfGated(ctx.platform, ctx.engineName) || r.p95 <= ctx.budgetMs;
export const staticWithinBudget = (r, ctx) =>
  !perfGated(ctx.platform, ctx.engineName) || r.staticP95 <= ctx.budgetMs;

// Should this reading be re-measured? Throttled, marginally over budget on a gated engine, cadence-
// locked on a gated engine (the host is starved, not the library), or over budget on a gated engine
// while the host is already known to be overloaded. A persistent reading still fails: a retry that
// is no better is discarded by isBetterReading, so none of these can mask a real regression.
export const needsRetry = (r, { platform, engineName, budgetMs, slackMs, hostOverloaded }) =>
  looksThrottled(r) ||
  marginalPerfOverBudget(r, { platform, engineName, budgetMs, slackMs }) ||
  (perfGated(platform, engineName) && looksCadenceLocked(r)) ||
  (perfGated(platform, engineName) && overPerfBudget(r, budgetMs) && hostOverloaded);
