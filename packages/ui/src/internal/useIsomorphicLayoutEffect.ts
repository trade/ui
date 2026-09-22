// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>
import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` warns on the server. The guard keeps SSR quiet while the effect still lands
 * synchronously after commit — which is what a ref read by a native event handler needs, since a
 * passive effect leaves a window in which the browser can dispatch against the previous value.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
