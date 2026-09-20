#!/usr/bin/env node
/**
 * @trade/ui - perf-retry policy check.
 *
 * scripts/perf-policy.mjs decides when the browser suite re-measures a frame-cadence reading. Those
 * branches once shipped untested (Greptile P2 on PR #28: "no deterministic check exercises those
 * policy branches"), which is the Rule zero failure this repo calls unrecoverable. This script
 * exercises every branch without launching a browser, and pins the suite's budget so the 25 ms gate
 * cannot be loosened silently.
 *
 * Exit code 0 = the policy behaves as documented.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  looksThrottled,
  perfGated,
  overPerfBudget,
  marginalPerfOverBudget,
  isBetterReading,
  isOverloadSignal,
  needsRetry,
  tickingWithinBudget,
  staticWithinBudget
} from './perf-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = 25; // the suite's T.maxP95FrameMs, pinned again below
const SLACK = 5;
const OVERLOAD = { droppedRatio: 0.25, staticP95Ms: 40 };
const reading = (r) => ({ p95: 16.7, staticP95: 16.8, droppedRatio: 0, ...r });
const darwin = (engineName) => ({ platform: 'darwin', engineName, budgetMs: BUDGET, slackMs: SLACK });

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass, detail });
const eq = (name, actual, expected) => check(name, Object.is(actual, expected), `got ${actual}, expected ${expected}`);

// --- 1. the 25 ms budget boundary (strictly greater fails) ---
eq('at the budget is not over (p95 25)', overPerfBudget(reading({ p95: 25 }), BUDGET), false);
eq('one ms over is over (p95 26)', overPerfBudget(reading({ p95: 26 }), BUDGET), true);
eq('the static reading is gated too (static 26)', overPerfBudget(reading({ staticP95: 26 }), BUDGET), true);
eq('a static reading at the budget passes', overPerfBudget(reading({ staticP95: 25 }), BUDGET), false);

// --- 2. the slack band ---
const marginal = (r, engineName = 'webkit') => marginalPerfOverBudget(reading(r), darwin(engineName));
eq('26 ms on a gated engine is marginal', marginal({ p95: 26 }), true);
eq('30 ms is still inside the 5 ms band', marginal({ p95: 30 }), true);
eq('31 ms is past the band', marginal({ p95: 31 }), false);
eq('a static overshoot past the band is not marginal', marginal({ staticP95: 31 }), false);
eq('within budget is not marginal', marginal({ p95: 25 }), false);
eq('marginally over on an informational engine is not marginal', marginal({ p95: 26 }, 'chromium'), false);
eq('a throttled reading is not "marginal"', marginal({ p95: 150 }), false);

// --- 3. which attempt is retained ---
const better = (current, candidate, engineName = 'webkit') =>
  isBetterReading(reading(current), reading(candidate), darwin(engineName));
eq('an unthrottled reading replaces a throttled one', better({ p95: 150 }, { p95: 26 }), true);
eq('a throttled reading never replaces a good one', better({ p95: 20 }, { p95: 150 }), false);
eq('in-budget replaces over-budget on a gated engine', better({ p95: 26 }, { p95: 20 }), true);
eq('over-budget never replaces in-budget (the reading is retained)', better({ p95: 20 }, { p95: 26 }), false);
eq('over-budget never replaces over-budget', better({ p95: 26 }, { p95: 27 }), false);
eq('no perf replacement on an informational engine', better({ p95: 26 }, { p95: 20 }, 'chromium'), false);

// --- 4. the host-overload signal ---
const overload = (r) => isOverloadSignal(r, OVERLOAD);
eq('a 57.9% dropped ratio is an overload signal', overload(reading({ droppedRatio: 0.579 })), true);
eq('a healthy reading is not', overload(reading({ droppedRatio: 0 })), false);
eq('the dropped-ratio threshold is strict (0.25 is not)', overload(reading({ droppedRatio: 0.25 })), false);
eq('an elevated static p95 is an overload signal', overload(reading({ staticP95: 41 })), true);
eq('a static p95 of 40 is not', overload(reading({ staticP95: 40 })), false);
eq('no reading is not an overload signal', overload(null), false);

// --- 5. the composed retry decision ---
const retry = (r, { engineName = 'webkit', hostOverloaded = false } = {}) =>
  needsRetry(reading(r), { ...darwin(engineName), hostOverloaded });
eq('throttled readings retry', retry({ p95: 150 }), true);
eq('a marginal gated reading retries', retry({ p95: 26 }), true);
eq('a clearly over-budget gated reading does NOT retry without overload', retry({ p95: 34 }), false);
eq('a clearly over-budget gated reading retries on an overloaded host', retry({ p95: 34 }, { hostOverloaded: true }), true);
eq('an overloaded host does not rescue an informational engine', retry({ p95: 34 }, { engineName: 'chromium', hostOverloaded: true }), false);
eq('a clean reading never retries', retry({ p95: 16.7 }), false);

// --- 6. exactly one engine is gated per platform ---
eq('darwin gates webkit', perfGated('darwin', 'webkit'), true);
eq('darwin does not gate chromium', perfGated('darwin', 'chromium'), false);
eq('win32 does not gate webkit (it is a port there)', perfGated('win32', 'webkit'), false);
eq('win32 gates chromium', perfGated('win32', 'chromium'), true);
eq('linux gates firefox', perfGated('linux', 'firefox'), true);

// --- 7. the throttle ceiling is unchanged ---
eq('a 100 ms p95 is not throttled', looksThrottled(reading({ p95: 100 })), false);
eq('a 101 ms p95 is throttled', looksThrottled(reading({ p95: 101 })), true);

// --- 8. pins: the suite must use this policy, and the gate must not move silently ---
const suite = readFileSync(resolve(root, 'scripts/browser-suite.mjs'), 'utf8');
const budgetMatch = suite.match(/maxP95FrameMs:\s*(\d+)/);
check('browser-suite declares a numeric perf budget', Boolean(budgetMatch), budgetMatch ? `maxP95FrameMs: ${budgetMatch[1]}` : 'not found');
eq('the suite budget still equals the pinned 25 ms', Number(budgetMatch?.[1]), BUDGET);
check('browser-suite imports the perf policy module', /from\s+['"]\.\/perf-policy\.mjs['"]/.test(suite), "import from './perf-policy.mjs'");
check('browser-suite routes the retry decision through needsRetry', /needsRetry\(reading/.test(suite), 'needsRetry(reading, ...) call');
check(
  'browser-suite does not re-derive the retry decision inline',
  !/looksThrottled\(reading\)\s*\|\|/.test(suite),
  'no inline copy of the retry predicates'
);
check(
  'the terminal attempt does not sleep the backoff',
  /if \(i \+ 1 < MAX_ATTEMPTS\) await new Promise/.test(suite),
  'backoff guarded by "i + 1 < MAX_ATTEMPTS"'
);

// --- 9. the gated verdicts as ENFORCED, not just declared: this is the boundary that actually
//        fails a run, so it is exercised here rather than trusted to a regex on a literal. ---
const verdictCtx = darwin('webkit');
eq('ticking verdict: 25 ms passes', tickingWithinBudget(reading({ p95: 25 }), verdictCtx), true);
eq('ticking verdict: 26 ms fails', tickingWithinBudget(reading({ p95: 26 }), verdictCtx), false);
eq('ticking verdict: 35 ms fails', tickingWithinBudget(reading({ p95: 35 }), verdictCtx), false);
eq('static verdict: 25 ms passes', staticWithinBudget(reading({ staticP95: 25 }), verdictCtx), true);
eq('static verdict: 26 ms fails', staticWithinBudget(reading({ staticP95: 26 }), verdictCtx), false);
eq('ticking verdict is informational on an un-gated engine', tickingWithinBudget(reading({ p95: 900 }), darwin('chromium')), true);
eq('static verdict is informational on an un-gated engine', staticWithinBudget(reading({ staticP95: 900 }), darwin('chromium')), true);

// --- 10. looksThrottled's static half (the ceiling and the finite guard) ---
eq('a throttled static reading is throttled (staticP95 101)', looksThrottled(reading({ staticP95: 101 })), true);
eq('a static reading at the ceiling is not throttled (100)', looksThrottled(reading({ staticP95: 100 })), false);
eq('a missing static reading is throttled', looksThrottled({ p95: 16.7 }), true);

// --- 11. the knobs the suite feeds the module are pinned too; validating the module with the
//         gate's own constants would leave the suite free to loosen its inputs ---
const pinned = (re) => {
  const m = suite.match(re);
  return m ? Number(m[1]) : NaN;
};
eq('the suite slack knob is pinned at 5 ms', pinned(/MARGINAL_PERF_SLACK_MS = (\d+)/), SLACK);
eq('the suite overload dropped-ratio knob is pinned at 0.25', pinned(/HOST_OVERLOAD_DROPPED_RATIO = ([0-9.]+)/), OVERLOAD.droppedRatio);
eq('the suite overload static-p95 knob is pinned at 40 ms', pinned(/HOST_OVERLOAD_STATIC_P95_MS = (\d+)/), OVERLOAD.staticP95Ms);

// --- 12. single source of truth: the suite's verdicts must run through this module, and no
//         predicate may be re-derived locally (the earlier text guard only caught the exact
//         `looksThrottled(reading) ||` spelling, so an inline copy under another name slipped past). ---
check('browser-suite gates ticking through the module', /tickingWithinBudget\(m, policyContext\(engine\)\)/.test(suite), 'tickingWithinBudget(...) call');
check('browser-suite gates static through the module', /staticWithinBudget\(m, policyContext\(engine\)\)/.test(suite), 'staticWithinBudget(...) call');
check(
  'browser-suite never compares the perf budget inline',
  !/[<>]=?\s*T\.maxP95FrameMs/.test(suite),
  'no comparison against T.maxP95FrameMs outside perf-policy.mjs (interpolation and passthrough are fine)'
);
check('browser-suite passes the host-overload state in', /hostOverloaded: hostOverloaded\(\)/.test(suite), 'hostOverloaded() at the call site');
for (const name of ['looksThrottled', 'perfGated', 'overPerfBudget', 'marginalPerfOverBudget', 'isBetterReading', 'isOverloadSignal', 'needsRetry', 'tickingWithinBudget', 'staticWithinBudget']) {
  check(`browser-suite does not redefine ${name}`, !new RegExp(`(?:const|let|var|function)\\s+${name}\\b`).test(suite), 'no local definition');
}

const passed = checks.filter((c) => c.pass).length;
console.log(`perf policy: ${passed}/${checks.length} checks passed`);
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : ' -> ' + c.detail}`);
process.exit(passed === checks.length ? 0 : 1);
