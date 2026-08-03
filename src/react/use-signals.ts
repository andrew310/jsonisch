import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { type Listener, setListener } from "../core/signal";

/**
 * Enables reactive signal reads inside a React component.
 *
 * Call it FIRST in the component body, before any signal reads. It registers
 * a per-component listener for the duration of the render, so every
 * `signal.value` read during render subscribes this component; when any of
 * those signals later changes, the component re-renders (via a forceUpdate
 * reducer) and — because subscriptions are one-shot — re-subscribes to
 * whatever it reads on that fresh render. Signals it did not read never
 * re-render it.
 *
 * Lifecycle details:
 * - Each render starts by dropping the previous render's subscriptions and
 *   re-tracking from scratch, so conditional reads narrow or widen the
 *   subscription set naturally.
 * - A layout effect clears the active listener right after commit so
 *   non-render code (event handlers, effects) never tracks accidentally.
 * - Unmount cleanup is deferred one macrotask: React `<StrictMode>` runs
 *   effect cleanup and immediately re-runs the effect on its synthetic
 *   remount, so tearing down subscriptions synchronously would kill live
 *   subscriptions in dev. The re-run cancels the pending teardown; only a
 *   real unmount lets the timeout fire.
 */
export function useSignals(): void {
  // Re-rendering is the only thing a notification does — a plain counter
  // reducer is the cheapest stable forceUpdate.
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);

  const [listener, unsubscribe] = useMemo(() => {
    const componentListener: Listener = {
      notify: forceUpdate,
      subscriptions: new Set(),
    };
    const unsubscribeAll = (): void => {
      for (const subscribers of componentListener.subscriptions) {
        subscribers.delete(componentListener);
      }
      componentListener.subscriptions.clear();
    };
    return [componentListener, unsubscribeAll] as const;
  }, [forceUpdate]);

  // Render phase: drop last render's subscriptions, then activate tracking
  // for the reads that follow in this component's body.
  unsubscribe();
  setListener(listener);

  // Stop tracking as soon as this commit's render work is done.
  useLayoutEffect(() => {
    setListener(undefined);
  });

  // Deferred unmount teardown (see the StrictMode note in the JSDoc above).
  const pendingTeardown = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pendingTeardown.current !== null) {
      clearTimeout(pendingTeardown.current);
      pendingTeardown.current = null;
    }
    return () => {
      pendingTeardown.current = setTimeout(unsubscribe);
    };
  }, [unsubscribe]);
}
