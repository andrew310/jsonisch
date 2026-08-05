import { describe, expect, it, vi } from "vitest";
import {
  batch,
  computed,
  createSignal,
  createTracker,
  getListener,
  type Listener,
  untrack,
  withListener,
} from "../signal";

function createListener(notify: () => void = () => {}): Listener {
  return { notify, subscriptions: new Set() };
}

/** Runs `read` with `listener` active, restoring the previous listener. */
function readWith<T>(listener: Listener, read: () => T): T {
  return withListener(listener, read);
}

describe("createSignal", () => {
  it("returns the initial value", () => {
    expect(createSignal(42).value).toBe(42);
  });

  it("starts at undefined without an initial value", () => {
    expect(createSignal<number>().value).toBeUndefined();
  });

  it("updates the value on write", () => {
    const signal = createSignal("a");
    signal.value = "b";
    expect(signal.value).toBe("b");
  });

  it("does not subscribe reads made without an active listener", () => {
    const notify = vi.fn();
    const signal = createSignal(1);
    void signal.value;
    withListener(createListener(notify), () => {});
    signal.value = 2;
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies a listener that read the signal when the value changes", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    signal.value = 2;
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not notify when the value is written but Object.is-equal", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    signal.value = 1;
    expect(notify).not.toHaveBeenCalled();
  });

  it("treats NaN as equal to NaN (no notify loop)", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(Number.NaN);
    readWith(listener, () => signal.value);
    signal.value = Number.NaN;
    expect(notify).not.toHaveBeenCalled();
  });

  it("consumes the subscription on notify (one-shot semantics)", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    signal.value = 2;
    signal.value = 3;
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("re-notifies after the listener re-reads (re-subscribes)", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    signal.value = 2;
    readWith(listener, () => signal.value);
    signal.value = 3;
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("keeps the listener's subscription bookkeeping in sync", () => {
    const listener = createListener();
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    expect(listener.subscriptions.size).toBe(1);
    signal.value = 2;
    expect(listener.subscriptions.size).toBe(0);
  });

  it("supports removing a listener from subscriber sets via its subscriptions (unsubscribe)", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    for (const subscribers of listener.subscriptions) {
      subscribers.delete(listener);
    }
    listener.subscriptions.clear();
    signal.value = 2;
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies multiple listeners independently", () => {
    const notifyA = vi.fn();
    const notifyB = vi.fn();
    const signal = createSignal(1);
    readWith(createListener(notifyA), () => signal.value);
    readWith(createListener(notifyB), () => signal.value);
    signal.value = 2;
    expect(notifyA).toHaveBeenCalledTimes(1);
    expect(notifyB).toHaveBeenCalledTimes(1);
  });
});

describe("withListener", () => {
  it("activates the listener for the duration of the function only", () => {
    const listener = createListener();
    expect(getListener()).toBeUndefined();
    withListener(listener, () => {
      expect(getListener()).toBe(listener);
    });
    expect(getListener()).toBeUndefined();
  });

  it("restores the OUTER listener afterwards (scoped, not cleared)", () => {
    const outer = createListener();
    const inner = createListener();
    withListener(outer, () => {
      withListener(inner, () => {
        expect(getListener()).toBe(inner);
      });
      expect(getListener()).toBe(outer);
    });
  });

  it("restores the outer listener even when the function throws", () => {
    const outer = createListener();
    withListener(outer, () => {
      expect(() =>
        withListener(createListener(), () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
      expect(getListener()).toBe(outer);
    });
    expect(getListener()).toBeUndefined();
  });

  it("only subscribes reads made while the listener is active", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const read = createSignal(1);
    const unread = createSignal(1);
    readWith(listener, () => read.value);
    unread.value = 2;
    expect(notify).not.toHaveBeenCalled();
    read.value = 2;
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("returns the function's return value", () => {
    expect(withListener(createListener(), () => 7)).toBe(7);
  });
});

describe("createTracker", () => {
  it("invalidates when a signal read through the tracker changes", () => {
    const onInvalidate = vi.fn();
    const tracker = createTracker(onInvalidate);
    const signal = createSignal(1);
    tracker.read(() => signal.value);
    signal.value = 2;
    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it("is one-shot: re-reading re-subscribes, not reading goes dormant", () => {
    const onInvalidate = vi.fn();
    const tracker = createTracker(onInvalidate);
    const signal = createSignal(1);
    tracker.read(() => signal.value);
    signal.value = 2;
    // Not re-read: the consumed subscription stays consumed.
    signal.value = 3;
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    tracker.read(() => signal.value);
    signal.value = 4;
    expect(onInvalidate).toHaveBeenCalledTimes(2);
  });

  it("dispose drops every subscription but keeps the tracker usable", () => {
    const onInvalidate = vi.fn();
    const tracker = createTracker(onInvalidate);
    const a = createSignal(1);
    const b = createSignal(1);
    tracker.read(() => a.value + b.value);
    tracker.dispose();
    a.value = 2;
    b.value = 2;
    expect(onInvalidate).not.toHaveBeenCalled();
    tracker.read(() => a.value);
    a.value = 3;
    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });

  it("does not leak tracking outside its read (scoped)", () => {
    const onInvalidate = vi.fn();
    const tracker = createTracker(onInvalidate);
    const signal = createSignal(1);
    tracker.read(() => {});
    void signal.value; // read OUTSIDE the tracker's window
    signal.value = 2;
    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it("defers and de-duplicates invalidations inside a batch", () => {
    const onInvalidate = vi.fn();
    const tracker = createTracker(onInvalidate);
    const a = createSignal(1);
    const b = createSignal(1);
    tracker.read(() => a.value + b.value);
    batch(() => {
      a.value = 2;
      b.value = 2;
      expect(onInvalidate).not.toHaveBeenCalled();
    });
    expect(onInvalidate).toHaveBeenCalledTimes(1);
  });
});

describe("untrack", () => {
  it("does not subscribe reads made inside untrack", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => untrack(() => signal.value));
    signal.value = 2;
    expect(notify).not.toHaveBeenCalled();
  });

  it("restores the outer listener afterwards", () => {
    const listener = createListener();
    withListener(listener, () => {
      untrack(() => {});
      expect(getListener()).toBe(listener);
    });
  });

  it("restores the outer listener even when the function throws", () => {
    const listener = createListener();
    withListener(listener, () => {
      expect(() =>
        untrack(() => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
      expect(getListener()).toBe(listener);
    });
  });

  it("returns the function's return value", () => {
    expect(untrack(() => 7)).toBe(7);
  });
});

describe("batch", () => {
  it("defers notifications until the batch ends", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    batch(() => {
      signal.value = 2;
      expect(notify).not.toHaveBeenCalled();
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("delivers one notification per listener across multiple writes", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const a = createSignal(1);
    const b = createSignal(1);
    readWith(listener, () => a.value + b.value);
    batch(() => {
      a.value = 2;
      b.value = 3;
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("flushes once at the end of the outermost nested batch", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    batch(() => {
      batch(() => {
        signal.value = 2;
      });
      expect(notify).not.toHaveBeenCalled();
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("returns the function's return value", () => {
    expect(batch(() => "done")).toBe("done");
  });

  it("still flushes pending notifications when the function throws", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const signal = createSignal(1);
    readWith(listener, () => signal.value);
    expect(() =>
      batch(() => {
        signal.value = 2;
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("reads inside the batch observe the written values", () => {
    const signal = createSignal(1);
    batch(() => {
      signal.value = 5;
      expect(signal.value).toBe(5);
    });
  });
});

describe("computed", () => {
  it("is lazy: does not compute before the first read", () => {
    const compute = vi.fn(() => 1);
    computed(compute);
    expect(compute).not.toHaveBeenCalled();
  });

  it("caches: repeated reads compute once", () => {
    const source = createSignal(2);
    const compute = vi.fn(() => source.value * 10);
    const derived = computed(compute);
    expect(derived.value).toBe(20);
    expect(derived.value).toBe(20);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes after a dependency changes", () => {
    const source = createSignal(2);
    const derived = computed(() => source.value * 10);
    expect(derived.value).toBe(20);
    source.value = 3;
    expect(derived.value).toBe(30);
  });

  it("does not recompute when a dependency is written an equal value", () => {
    const source = createSignal(2);
    const compute = vi.fn(() => source.value * 10);
    const derived = computed(compute);
    void derived.value;
    source.value = 2;
    void derived.value;
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not recompute when an unrelated signal changes", () => {
    const source = createSignal(2);
    const unrelated = createSignal(0);
    const compute = vi.fn(() => source.value * 10);
    const derived = computed(compute);
    void derived.value;
    unrelated.value = 1;
    void derived.value;
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("notifies its subscribers when a dependency changes", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const source = createSignal(2);
    const derived = computed(() => source.value * 10);
    readWith(listener, () => derived.value);
    source.value = 3;
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("subscribes the reading component to the computed, not its sources", () => {
    const listener = createListener();
    const source = createSignal(2);
    const derived = computed(() => source.value * 10);
    readWith(listener, () => derived.value);
    // Exactly one subscription: the computed's subscriber set.
    expect(listener.subscriptions.size).toBe(1);
  });

  it("propagates through a computed chain", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const source = createSignal(1);
    const plusOne = computed(() => source.value + 1);
    const timesTen = computed(() => plusOne.value * 10);
    expect(readWith(listener, () => timesTen.value)).toBe(20);
    source.value = 4;
    expect(notify).toHaveBeenCalledTimes(1);
    expect(timesTen.value).toBe(50);
  });

  it("re-tracks dependencies on every run (conditional reads)", () => {
    const useFirst = createSignal(true);
    const first = createSignal("first");
    const second = createSignal("second");
    const compute = vi.fn(() =>
      useFirst.value ? first.value : second.value,
    );
    const derived = computed(compute);
    expect(derived.value).toBe("first");
    useFirst.value = false;
    expect(derived.value).toBe("second");
    expect(compute).toHaveBeenCalledTimes(2);
    // `first` is no longer a dependency: changing it must not invalidate.
    first.value = "changed";
    expect(derived.value).toBe("second");
    expect(compute).toHaveBeenCalledTimes(2);
    // `second` still is.
    second.value = "second-changed";
    expect(derived.value).toBe("second-changed");
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it("ignores dependencies read inside untrack", () => {
    const tracked = createSignal(1);
    const ignored = createSignal(100);
    const compute = vi.fn(() => tracked.value + untrack(() => ignored.value));
    const derived = computed(compute);
    expect(derived.value).toBe(101);
    ignored.value = 200;
    expect(derived.value).toBe(101);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("reads inside a batch observe fresh values (eager invalidation)", () => {
    const source = createSignal(1);
    const derived = computed(() => source.value * 2);
    expect(derived.value).toBe(2);
    batch(() => {
      source.value = 5;
      expect(derived.value).toBe(10);
    });
  });

  it("defers subscriber notification to batch end while invalidating eagerly", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const source = createSignal(1);
    const derived = computed(() => source.value * 2);
    readWith(listener, () => derived.value);
    batch(() => {
      source.value = 3;
      expect(notify).not.toHaveBeenCalled();
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("notifies a diamond dependency once per batch", () => {
    const notify = vi.fn();
    const listener = createListener(notify);
    const source = createSignal(1);
    const left = computed(() => source.value + 1);
    const right = computed(() => source.value + 2);
    readWith(listener, () => left.value + right.value);
    batch(() => {
      source.value = 10;
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(left.value).toBe(11);
    expect(right.value).toBe(12);
  });

  it("propagates compute errors to the reader and retries on the next read", () => {
    let shouldThrow = true;
    const compute = vi.fn(() => {
      if (shouldThrow) throw new Error("compute failed");
      return "ok";
    });
    const derived = computed(compute);
    expect(() => derived.value).toThrow("compute failed");
    shouldThrow = false;
    expect(derived.value).toBe("ok");
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("restores the outer listener after computing (nested read tracking)", () => {
    const listener = createListener();
    const source = createSignal(1);
    const derived = computed(() => source.value);
    const direct = createSignal(2);
    readWith(listener, () => {
      void derived.value; // triggers a compute with its own listener
      void direct.value; // must still track the component listener
    });
    expect(listener.subscriptions.size).toBe(2);
  });

  describe("cycle detection", () => {
    it("throws a named error on a direct self-read instead of overflowing", () => {
      const self: { value?: number } = {};
      const derived = computed<number>(
        () => ((self.value as number | undefined) ?? 0) + 1,
      );
      Object.defineProperty(self, "value", {
        get: () => derived.value,
      });
      expect(() => derived.value).toThrow(/Cycle detected/);
    });

    it("throws on an indirect cycle through another computed", () => {
      /* eslint-disable prefer-const */
      let b: { readonly value: number };
      const a = computed(() => b.value + 1);
      b = computed(() => a.value + 1);
      /* eslint-enable prefer-const */
      expect(() => a.value).toThrow(/Cycle detected/);
    });

    it("stays usable after a detected cycle resolves", () => {
      const useSelf = createSignal(true);
      let derived: { readonly value: number };
      derived = computed(() => (useSelf.value ? derived.value : 42));
      expect(() => derived.value).toThrow(/Cycle detected/);
      useSelf.value = false;
      expect(derived.value).toBe(42);
    });
  });
});
