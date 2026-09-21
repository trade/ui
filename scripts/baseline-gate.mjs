// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

/**
 * @trade/ui — baseline gate resolution.
 *
 * Pure functions that decide whether a given host platform should GATE its
 * visual regression checks, or report them as informational. A host gates
 * only when a committed baseline set actually exists for its platform; if
 * the host's own directory is absent but the manifest's nominated platform
 * has a committed set, that platform is used; otherwise the host is
 * informational until the PNGs land.
 *
 * Separated from browser-suite.mjs so the logic is unit-testable without a
 * browser, and so verify.mjs can regression-test it (Rule Zero).
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ENGINES = ['chromium', 'firefox', 'webkit'];
const VIEWPORTS = ['desktop', 'mobile'];

/** True when baselines/<platform>/ actually contains the expected PNGs. */
export function baselineSetIsComplete(baselinesDir, platform) {
  const dir = resolve(baselinesDir, platform);
  if (!existsSync(dir)) return false;
  try {
    const files = readdirSync(dir);
    return ENGINES.every((e) =>
      VIEWPORTS.every((vp) =>
        files.includes(`${e}-${vp}-dark.png`) &&
        files.includes(`${e}-${vp}-light.png`)
      )
    );
  } catch {
    return false;
  }
}

/**
 * Decide which platform a host should gate on.
 *  - If the host's own baselines/<hostPlatform>/ is complete → gate on it
 *  - Else if manifest.latestPlatform's directory is complete → gate on that
 *  - Else → null (informational; nothing to compare against)
 */
export function resolveBaselinePlatform({ hostPlatform, baselinesDir, manifest }) {
  const ownSet = baselineSetIsComplete(baselinesDir, hostPlatform);
  if (ownSet) return hostPlatform;
  const nominated = manifest?.latestPlatform;
  if (nominated && baselineSetIsComplete(baselinesDir, nominated)) return nominated;
  return null;
}
