// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

// Unit tests for the visual-baseline gate resolution. A host gates only when a committed baseline
// set for its platform actually exists; this is the logic that decides that, without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baselineSetIsComplete, resolveBaselinePlatform } from '../scripts/baseline-gate.mjs';

const ENGINES = ['chromium', 'firefox', 'webkit'];
const VIEWPORTS = ['desktop', 'mobile'];

function makeSet(root, platform, { complete }) {
  const dir = join(root, platform);
  mkdirSync(dir, { recursive: true });
  const names = [];
  for (const engine of ENGINES) {
    for (const viewport of VIEWPORTS) {
      for (const theme of ['dark', 'light']) names.push(`${engine}-${viewport}-${theme}.png`);
    }
  }
  for (const name of complete ? names : names.slice(0, names.length - 1)) {
    writeFileSync(join(dir, name), 'x');
  }
}

test('baseline gate resolution', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ui-baselines-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(baselineSetIsComplete(root, 'linux'), false, 'an absent directory is incomplete');

  makeSet(root, 'linux', { complete: false });
  assert.equal(baselineSetIsComplete(root, 'linux'), false, 'a partial set is incomplete');

  makeSet(root, 'linux', { complete: true });
  assert.equal(baselineSetIsComplete(root, 'linux'), true, 'a full 3x2x2 set is complete');

  assert.equal(
    resolveBaselinePlatform({ hostPlatform: 'linux', baselinesDir: root, manifest: { latestPlatform: 'darwin' } }),
    'linux',
    'a host with its own complete set gates on it'
  );
  assert.equal(
    resolveBaselinePlatform({ hostPlatform: 'darwin', baselinesDir: root, manifest: { latestPlatform: 'linux' } }),
    'linux',
    'an absent host falls back to the nominated complete set'
  );
  assert.equal(
    resolveBaselinePlatform({ hostPlatform: 'win32', baselinesDir: root, manifest: { latestPlatform: 'darwin' } }),
    null,
    'absent host + absent nominated set -> informational'
  );
  assert.equal(
    resolveBaselinePlatform({ hostPlatform: 'win32', baselinesDir: root, manifest: null }),
    null,
    'no manifest -> informational'
  );

  // A nominated directory that exists but is incomplete must NOT be selected: gating against a
  // partial set would compare against baselines that are not there.
  makeSet(root, 'darwin', { complete: false });
  assert.equal(baselineSetIsComplete(root, 'darwin'), false, 'a partial nominated set is incomplete');
  assert.equal(
    resolveBaselinePlatform({ hostPlatform: 'win32', baselinesDir: root, manifest: { latestPlatform: 'darwin' } }),
    null,
    'absent host + incomplete nominated set -> informational, never a missing set'
  );
});
