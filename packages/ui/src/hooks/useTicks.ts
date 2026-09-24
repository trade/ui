// SPDX-License-Identifier: MIT OR Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react';

/** `'frame'` flushes once per animation frame; a number flushes at most every N milliseconds. */
export type TickCadence = 'frame' | number;

export interface UseTicksOptions {
  /** Defaults to `'frame'`. */
  every?: TickCadence;
}

type Updater<T> = T | ((previous: T) => T);
type Handle = { id: number; kind: 'frame' | 'timer' };

const canAnimate = () => typeof requestAnimationFrame === 'function';

/**
 * Coalesce a high-frequency tick stream into a bounded number of renders.
 *
 * Market data arrives far more often than the display refreshes. Applying every message directly
 * means React renders more frames than the screen can show, and each render walks every row and
 * cell — measured at ~360 cell renders per frame in the 60-row harness. This hook queues updates
 * and commits them **at most once per cadence window**, so a burst of a thousand ticks costs a
 * thousand cheap updater calls and **one** render.
 *
 * The updater form is deliberate: a tick stream usually carries *deltas*, and a snapshot-style
 * "keep the last value" helper would silently drop them. Queued updaters are applied in order at
 * flush time, so nothing is lost. Callers with full snapshots pass `() => snapshot` instead.
 *
 * ```tsx
 * const [rows, pushRows] = useTicks(initialRows);        // one flush per frame
 * socket.onmessage = (event) => pushRows((rows) => applyDelta(rows, event.data));
 * ```
 *
 * Scheduling notes:
 * - A queued update is never stranded. When the pending flush is cancelled — by an unmount, by a
 *   cadence change, or by development StrictMode's simulated remount — the next effect setup
 *   re-arms it if the queue is still non-empty. (StrictMode runs setup → cleanup → setup at mount,
 *   so a tick queued during the first setup would otherwise wait for a later tick that may never
 *   come.)
 * - Changing `every` while a flush is pending re-arms it at the new cadence rather than letting the
 *   old one — potentially 60 seconds — decide when those ticks appear.
 * - The queue is client-only: a server render uses the initial value, which is what SSR wants.
 *   With no `requestAnimationFrame` the timeout path is used, and with neither the flush runs
 *   synchronously rather than never.
 */
export function useTicks<T>(initial: T, options: UseTicksOptions = {}): [T, (update: Updater<T>) => void] {
  const cadence: TickCadence = options.every ?? 'frame';
  const [value, setValue] = useState<T>(initial);

  const queue = useRef<Updater<T>[]>([]);
  const handle = useRef<Handle | null>(null);

  const flush = useCallback(() => {
    handle.current = null;
    const pending = queue.current;
    if (pending.length === 0) return; // an idle window is not a render
    queue.current = [];
    setValue((previous) =>
      pending.reduce<T>(
        (accumulated, update) =>
          typeof update === 'function' ? (update as (previous: T) => T)(accumulated) : update,
        previous
      )
    );
  }, []);

  const cancelPending = useCallback(() => {
    const scheduled = handle.current;
    if (scheduled === null) return;
    if (scheduled.kind === 'frame') {
      // an environment with rAF but no cancelAnimationFrame cannot cancel; do not clearTimeout a frame id
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scheduled.id);
    } else {
      clearTimeout(scheduled.id);
    }
    handle.current = null;
  }, []);

  const schedule = useCallback(() => {
    if (handle.current !== null) return; // a flush is already pending for this window
    if (cadence === 'frame' && canAnimate()) {
      handle.current = { id: requestAnimationFrame(flush), kind: 'frame' };
    } else if (typeof setTimeout === 'function') {
      handle.current = { id: setTimeout(flush, cadence === 'frame' ? 0 : cadence) as unknown as number, kind: 'timer' };
    } else {
      flush();
    }
  }, [cadence, flush]);

  const push = useCallback(
    (update: Updater<T>) => {
      queue.current.push(update);
      schedule();
    },
    [schedule]
  );

  // One effect covers every way the pending flush can be invalidated: unmount (cleanup, no
  // re-setup), a cadence change (cleanup then setup with the new cadence), and StrictMode's
  // mount-time cleanup+setup (re-arms whatever the cleanup cancelled).
  useEffect(() => {
    if (queue.current.length > 0) schedule();
    return cancelPending;
  }, [cadence, schedule, cancelPending]);

  return [value, push];
}
