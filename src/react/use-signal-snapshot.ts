import { useMemo, useSyncExternalStore } from "react";
import { createTracker } from "../core/signal";

/**
 * Value-level equality for snapshot objects: top-level keys compared with
 * `Object.is`, with ONE extra level for plain arrays and plain objects —
 * computed results (a `DerivedState`, an errors array) are rebuilt with a
 * fresh identity on every recompute, and without the value compare every
 * notification would produce a render even when nothing visible changed.
 * Deeper nesting falls back to "not equal" (re-render), never the other
 * way — a false negative costs one render, a false positive would cost a
 * stale UI.
 */
export function snapshotEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null) return false;
  if (typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => valueEqual(value, b[index]));
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      valueEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
}

/**
 * The one-level-down compare: `Object.is`, widened to a shallow compare for
 * plain arrays/objects (fresh-identity computed results).
 */
function valueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null) return false;
  if (typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => Object.is(value, b[index]));
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
}

/**
 * The store contract `useSyncExternalStore` consumes.
 */
interface SnapshotStore<T> {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => T;
}

/**
 * Creates the external store bridging the signal graph to React.
 *
 * Four load-bearing properties:
 *
 * - `getSnapshot` NEVER computes — it returns the cached reference. React
 *   calls it during render and after every notification; computing there
 *   would either violate render purity or clobber an outer listener. The
 *   tracked read lives in the tracker's invalidation callback instead.
 * - The invalidation callback re-reads ONLY while subscribed to React.
 *   One-shot core semantics make an unsubscribed store dormant after its
 *   first notification, so a render that never commits (StrictMode's
 *   discarded pass, a concurrent abort) cannot leak a live subscription —
 *   the signal graph drops its last reference to the tracker and the
 *   whole store is garbage.
 * - `subscribe` re-reads before installing the React callback: it may be
 *   re-establishing a store that went dormant (mount race) or was disposed
 *   (StrictMode's synthetic unmount/remount), and the value may have moved
 *   while nobody listened. React re-reads `getSnapshot` right after
 *   subscribing and re-renders on mismatch, so a change in the gap is
 *   caught by value, not by version bookkeeping.
 * - Equality is by VALUE (`isEqual`): a notification that changes nothing
 *   visible keeps the previous snapshot reference and produces no render.
 */
function createSnapshotStore<T>(
  compute: () => T,
  isEqual: (a: T, b: T) => boolean,
): SnapshotStore<T> {
  let notifyReact: (() => void) | undefined;
  let snapshot: T;

  const tracker = createTracker(() => {
    // Unsubscribed (before commit, after unmount, or a discarded render):
    // do NOT re-read — re-subscribing here would keep a dead store live
    // forever. `subscribe` re-reads when (if) React attaches.
    if (notifyReact === undefined) return;
    const next = tracker.read(compute);
    if (isEqual(snapshot, next)) return;
    snapshot = next;
    notifyReact();
  });

  snapshot = tracker.read(compute);

  return {
    subscribe(onStoreChange) {
      const next = tracker.read(compute);
      if (!isEqual(snapshot, next)) {
        snapshot = next;
      }
      notifyReact = onStoreChange;
      return () => {
        notifyReact = undefined;
        tracker.dispose();
      };
    },
    getSnapshot: () => snapshot,
  };
}

/**
 * Subscribes the component to exactly the signals `compute` reads and
 * returns the computed snapshot. THE reactive primitive of the react
 * adapter — every jsonisch hook reads through it, and it is the public
 * escape hatch for a component that needs a narrower subscription than
 * `useField` provides.
 *
 * React-Compiler-safe by construction: the tracked reads happen inside a
 * closure the library invokes — the compiler can only elide expressions
 * whose call sites it memoized, never a call made from a hook's internals —
 * and the returned snapshot is an immutable value whose identity changes
 * when any observed value changes, so compiler memo caches keyed on it
 * invalidate correctly instead of freezing.
 *
 * `useMemo` semantics apply to `deps`: the compute closure is captured when
 * `deps` change, so everything it reads must be a signal (tracked) or
 * listed in `deps` (recreates the store). `isEqual` gates re-renders by
 * value; it defaults to `snapshotEqual`.
 *
 * @param compute The tracked read producing the snapshot.
 * @param deps The non-signal inputs of `compute` (useMemo contract).
 * @param isEqual The snapshot equality gate.
 *
 * @returns The current snapshot.
 */
export function useSignalSnapshot<T>(
  compute: () => T,
  deps: readonly unknown[],
  isEqual: (a: T, b: T) => boolean = snapshotEqual,
): T {
  const store = useMemo(
    () => createSnapshotStore(compute, isEqual),
    // The deps array IS the memo contract of this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    // A server render never re-renders, so the pure cached accessor is a
    // valid server snapshot as-is.
    store.getSnapshot,
  );
}
