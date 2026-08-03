/**
 * Reactive signal primitive for jsonisch.
 *
 * A deliberately tiny push-based reactivity system built for a per-component
 * subscription model (see `@rwa/jsonisch/react` `useSignals`):
 *
 * - Reads made while a listener is active (via `setListener`) subscribe that
 *   listener to the signal.
 * - Subscriptions are ONE-SHOT: notifying a listener consumes its
 *   subscription. Listeners are expected to re-read (and thereby
 *   re-subscribe) as a consequence of being notified — exactly what a React
 *   component does when its render re-runs.
 * - `computed` signals are lazy and cached. Staleness propagates through the
 *   computed graph eagerly (even inside `batch`), so a read always reflects
 *   the latest written inputs; only plain listener notifications (e.g.
 *   component re-renders) are deferred by `batch`.
 *
 * Known trade-off (documented, not a bug): outside `batch`, a plain listener
 * whose `notify` synchronously reads other signals may observe a stale
 * computed across a "diamond" dependency while sibling invalidations are
 * still propagating. The React adapter is immune because `notify` only
 * schedules a re-render; core methods that write multiple signals should use
 * `batch`.
 */

/**
 * A writable reactive signal.
 */
export interface Signal<T> {
  /**
   * The value of the signal. Reading subscribes the active listener;
   * writing a non-`Object.is`-equal value notifies subscribers.
   */
  value: T;
}

/**
 * A read-only reactive signal (the shape returned by `computed`).
 */
export interface ReadonlySignal<T> {
  /**
   * The value of the signal. Reading subscribes the active listener.
   */
  readonly value: T;
}

/**
 * A subscription target. One listener typically represents one component
 * (React adapter) or one computed signal (internal).
 */
export interface Listener {
  /**
   * Notifies the listener that a subscribed signal changed. Deferred (and
   * de-duplicated) while a `batch` is active.
   */
  notify: () => void;
  /**
   * The subscriber sets this listener is currently registered in. Used to
   * clean up subscriptions when the listener goes away (e.g. unmount) and
   * kept in sync by the one-shot notification cycle.
   */
  subscriptions: Set<Set<Listener>>;
  /**
   * Optional immediate invalidation hook. When present it runs synchronously
   * at write time, even inside `batch`. Computed signals use it to mark
   * themselves stale and propagate invalidation through the graph so that
   * reads inside a batch never see stale cached values.
   */
  invalidate?: () => void;
}

/**
 * The currently active listener, if any. Reads while it is set subscribe it.
 */
let currentListener: Listener | undefined;

/**
 * Sets (or clears) the active listener that signal reads subscribe to.
 *
 * @param listener The listener to activate, or `undefined` to deactivate.
 */
export function setListener(listener: Listener | undefined): void {
  currentListener = listener;
}

/**
 * Returns the currently active listener, if any.
 *
 * Advanced/internal: exposed for the store implementation and for tests that
 * verify subscription bookkeeping.
 */
export function getListener(): Listener | undefined {
  return currentListener;
}

/**
 * Plain-listener notifications collected while a batch is active.
 */
let batchQueue: Set<Listener> | undefined;

/**
 * Current batch nesting depth.
 */
let batchDepth = 0;

/**
 * Subscribes the active listener (if any) to the given subscriber set.
 */
function track(subscribers: Set<Listener>): void {
  if (currentListener) {
    subscribers.add(currentListener);
    currentListener.subscriptions.add(subscribers);
  }
}

/**
 * Consumes and notifies a subscriber set (one-shot semantics).
 *
 * Invalidation hooks run first and always synchronously, so computed
 * staleness propagates through the whole graph before any plain listener is
 * notified. Plain notifications are deferred into the batch queue when a
 * batch is active.
 */
function notifySubscribers(subscribers: Set<Listener>): void {
  const snapshot = [...subscribers];
  for (const subscriber of snapshot) {
    subscriber.subscriptions.delete(subscribers);
  }
  subscribers.clear();
  for (const subscriber of snapshot) {
    subscriber.invalidate?.();
  }
  for (const subscriber of snapshot) {
    if (batchQueue) {
      batchQueue.add(subscriber);
    } else {
      subscriber.notify();
    }
  }
}

/**
 * Creates a writable reactive signal without an initial value.
 *
 * @returns The created signal.
 */
export function createSignal<T>(): Signal<T | undefined>;

/**
 * Creates a writable reactive signal with an initial value.
 *
 * @param initialValue The initial value.
 *
 * @returns The created signal.
 */
export function createSignal<T>(initialValue: T): Signal<T>;

export function createSignal<T>(initialValue?: T): Signal<T | undefined> {
  const subscribers = new Set<Listener>();
  let value = initialValue;
  return {
    get value(): T | undefined {
      track(subscribers);
      return value;
    },
    set value(nextValue: T | undefined) {
      if (!Object.is(nextValue, value)) {
        value = nextValue;
        notifySubscribers(subscribers);
      }
    },
  };
}

/**
 * Creates a lazy, cached, read-only signal derived from other signals.
 *
 * The compute function runs on first read and again after any signal it read
 * during its last run changes (dependencies are re-tracked on every run, so
 * conditional reads narrow or widen the dependency set). Subscribers of the
 * computed are notified when it is invalidated; the fresh value is produced
 * on the next read.
 *
 * @param compute The function deriving the value.
 *
 * @returns The created read-only signal.
 */
export function computed<T>(compute: () => T): ReadonlySignal<T> {
  const subscribers = new Set<Listener>();
  let cache: T;
  let stale = true;
  const self: Listener = {
    // All propagation happens in `invalidate`; by the time deferred batch
    // notifications run there is nothing left for the computed to do.
    notify: () => {},
    subscriptions: new Set(),
    invalidate(): void {
      if (!stale) {
        stale = true;
        notifySubscribers(subscribers);
      }
    },
  };
  return {
    get value(): T {
      track(subscribers);
      if (stale) {
        // Drop subscriptions from the previous run before re-tracking so
        // no-longer-read signals cannot invalidate this computed.
        for (const sourceSubscribers of self.subscriptions) {
          sourceSubscribers.delete(self);
        }
        self.subscriptions.clear();
        const previousListener = currentListener;
        currentListener = self;
        try {
          cache = compute();
        } finally {
          currentListener = previousListener;
        }
        stale = false;
      }
      return cache;
    },
  };
}

/**
 * Batches signal writes: plain listener notifications (e.g. component
 * re-renders) are collected, de-duplicated, and delivered once when the
 * outermost batch ends. Computed invalidation is NOT deferred, so reads
 * inside the batch observe the written values.
 *
 * @param fn The function to execute in the batch.
 *
 * @returns The return value of the function.
 */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  batchQueue ??= new Set();
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const queue = batchQueue;
      batchQueue = undefined;
      for (const listener of queue) {
        listener.notify();
      }
    }
  }
}

/**
 * Executes a function without tracking signal reads as subscriptions.
 *
 * @param fn The function to execute untracked.
 *
 * @returns The return value of the function.
 */
export function untrack<T>(fn: () => T): T {
  const previousListener = currentListener;
  currentListener = undefined;
  try {
    return fn();
  } finally {
    currentListener = previousListener;
  }
}
