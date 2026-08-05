// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useState, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  batch,
  computed,
  createSignal,
  getListener,
} from "../../core/signal";
import { snapshotEqual, useSignalSnapshot } from "../use-signal-snapshot";

// Repo gotcha: vitest runs without globals, so React Testing Library's
// auto-cleanup never registers — clean up explicitly.
afterEach(() => {
  cleanup();
});

describe("useSignalSnapshot", () => {
  it("re-renders with a fresh snapshot when an observed signal changes", () => {
    const signal = createSignal("initial");

    function Reader(): ReactElement {
      const snap = useSignalSnapshot(() => ({ text: signal.value }), []);
      return <span data-testid="value">{snap.text}</span>;
    }

    const { getByTestId } = render(<Reader />);
    expect(getByTestId("value").textContent).toBe("initial");

    act(() => {
      signal.value = "updated";
    });
    expect(getByTestId("value").textContent).toBe("updated");
  });

  it("does not re-render for signals the compute did not read", () => {
    const read = createSignal("read");
    const unread = createSignal("unread");
    let renderCount = 0;

    function PartialReader(): ReactElement {
      const snap = useSignalSnapshot(() => ({ text: read.value }), []);
      renderCount++;
      return <span>{snap.text}</span>;
    }

    render(<PartialReader />);
    const initialRenderCount = renderCount;

    act(() => {
      unread.value = "changed";
    });
    expect(renderCount).toBe(initialRenderCount);
  });

  it("does not re-render when a notification recomputes to an equal value", () => {
    const source = createSignal(2);
    // Parity flips only when the integer parity changes — a 2 → 4 write
    // notifies but recomputes to the same snapshot values.
    let renderCount = 0;

    function ParityReader(): ReactElement {
      const snap = useSignalSnapshot(
        () => ({ even: source.value % 2 === 0 }),
        [],
      );
      renderCount++;
      return <span data-testid="value">{String(snap.even)}</span>;
    }

    const { getByTestId } = render(<ParityReader />);
    const initialRenderCount = renderCount;

    act(() => {
      source.value = 4;
    });
    expect(renderCount).toBe(initialRenderCount);

    // But it stays SUBSCRIBED through the skipped render (one-shot core
    // semantics: the equality-gated recompute must still re-subscribe).
    act(() => {
      source.value = 5;
    });
    expect(getByTestId("value").textContent).toBe("false");
    expect(renderCount).toBe(initialRenderCount + 1);
  });

  it("re-renders once for a batched multi-signal update", () => {
    const a = createSignal(1);
    const b = createSignal(2);
    let renderCount = 0;

    function SumReader(): ReactElement {
      const snap = useSignalSnapshot(() => ({ sum: a.value + b.value }), []);
      renderCount++;
      return <span data-testid="sum">{snap.sum}</span>;
    }

    const { getByTestId } = render(<SumReader />);
    const initialRenderCount = renderCount;

    act(() => {
      batch(() => {
        a.value = 10;
        b.value = 20;
      });
    });
    expect(getByTestId("sum").textContent).toBe("30");
    expect(renderCount - initialRenderCount).toBe(1);
  });

  it("re-renders when a read computed's dependency changes", () => {
    const source = createSignal(2);
    const doubled = computed(() => source.value * 2);

    function ComputedReader(): ReactElement {
      const snap = useSignalSnapshot(() => ({ value: doubled.value }), []);
      return <span data-testid="value">{snap.value}</span>;
    }

    const { getByTestId } = render(<ComputedReader />);
    expect(getByTestId("value").textContent).toBe("4");

    act(() => {
      source.value = 5;
    });
    expect(getByTestId("value").textContent).toBe("10");
  });

  it("tracks conditional reads notification by notification", () => {
    const which = createSignal<"first" | "second">("first");
    const first = createSignal("F0");
    const second = createSignal("S0");

    function ConditionalReader(): ReactElement {
      const snap = useSignalSnapshot(
        () => ({
          value: which.value === "first" ? first.value : second.value,
        }),
        [],
      );
      return <span data-testid="value">{snap.value}</span>;
    }

    const { getByTestId } = render(<ConditionalReader />);
    expect(getByTestId("value").textContent).toBe("F0");

    act(() => {
      which.value = "second";
    });
    expect(getByTestId("value").textContent).toBe("S0");

    act(() => {
      second.value = "S1";
    });
    expect(getByTestId("value").textContent).toBe("S1");
  });

  it("stays subscribed under StrictMode's synthetic unmount/remount", () => {
    const signal = createSignal(0);

    function Reader(): ReactElement {
      const snap = useSignalSnapshot(() => ({ value: signal.value }), []);
      return <span data-testid="value">{snap.value}</span>;
    }

    const { getByTestId } = render(
      <StrictMode>
        <Reader />
      </StrictMode>,
    );

    act(() => {
      signal.value = 7;
    });
    expect(getByTestId("value").textContent).toBe("7");

    act(() => {
      signal.value = 8;
    });
    expect(getByTestId("value").textContent).toBe("8");
  });

  it("catches a change in the render-to-subscribe gap (mount race)", () => {
    const signal = createSignal("before");

    function Reader(): ReactElement {
      const snap = useSignalSnapshot(() => ({ text: signal.value }), []);
      if (signal.value === "before" && snap.text === "before") {
        // Simulate the gap: the signal moves after the render read it but
        // before React subscribes (commit). Writing during render is not a
        // real pattern — it stands in for a concurrent write landing in
        // the gap, which React resolves by re-reading after subscribe.
        signal.value = "after";
      }
      return <span data-testid="value">{snap.text}</span>;
    }

    const { getByTestId } = render(<Reader />);
    expect(getByTestId("value").textContent).toBe("after");
  });

  it("unsubscribes on unmount and goes dormant", () => {
    const signal = createSignal("alive");
    let renderCount = 0;

    function Reader(): ReactElement {
      const snap = useSignalSnapshot(() => ({ text: signal.value }), []);
      renderCount++;
      return <span>{snap.text}</span>;
    }

    const { unmount } = render(<Reader />);
    unmount();

    const renderCountAfterUnmount = renderCount;
    act(() => {
      signal.value = "after-unmount";
    });
    expect(renderCount).toBe(renderCountAfterUnmount);
  });

  it("never leaves a listener active in the component body (no cross-component leak)", () => {
    // The v1 `useSignals` hole: tracking stayed on between the hook call
    // and commit, so a LATER component's untracked reads silently
    // subscribed the EARLIER component. Scoped tracking removes the
    // global listener entirely — the component body renders untracked.
    const signal = createSignal("s0");
    let listenerDuringSiblingRender: unknown = "unset";
    let snapshotUserRenders = 0;

    function SnapshotUser(): ReactElement {
      useSignalSnapshot(() => ({ text: signal.value }), []);
      snapshotUserRenders++;
      return <span />;
    }

    function Sibling(): ReactElement {
      listenerDuringSiblingRender = getListener();
      // A raw signal read in a component body: must NOT subscribe anyone.
      void signal.value;
      return <span />;
    }

    render(
      <>
        <SnapshotUser />
        <Sibling />
      </>,
    );
    expect(listenerDuringSiblingRender).toBeUndefined();

    const before = snapshotUserRenders;
    act(() => {
      signal.value = "s1";
    });
    // SnapshotUser re-renders for its own read; the sibling's raw read
    // must not have double-subscribed it or anyone else.
    expect(snapshotUserRenders).toBe(before + 1);
  });

  it("recreates the store when deps change (useMemo contract)", () => {
    const first = createSignal("F0");
    const second = createSignal("S0");

    function DepsReader(): ReactElement {
      const [which, setWhich] = useState<"first" | "second">("first");
      const signal = which === "first" ? first : second;
      const snap = useSignalSnapshot(() => ({ text: signal.value }), [signal]);
      return (
        <button
          type="button"
          data-testid="value"
          onClick={() => setWhich("second")}
        >
          {snap.text}
        </button>
      );
    }

    const { getByTestId } = render(<DepsReader />);
    expect(getByTestId("value").textContent).toBe("F0");

    act(() => {
      getByTestId("value").click();
    });
    // The new store computed fresh values in the same render — no stale
    // snapshot from the old closure.
    expect(getByTestId("value").textContent).toBe("S0");

    act(() => {
      second.value = "S1";
    });
    expect(getByTestId("value").textContent).toBe("S1");

    // The old dep's signal no longer reaches this component.
    act(() => {
      first.value = "F1";
    });
    expect(getByTestId("value").textContent).toBe("S1");
  });
});

describe("snapshotEqual", () => {
  it("compares top-level values with Object.is", () => {
    expect(snapshotEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(snapshotEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(snapshotEqual({ a: Number.NaN }, { a: Number.NaN })).toBe(true);
    expect(snapshotEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("compares fresh-identity nested plain objects and arrays one level deep", () => {
    // The DerivedState case: a recompute rebuilds { value, error } with a
    // new identity every time.
    expect(
      snapshotEqual(
        { derived: { value: 500000, error: null } },
        { derived: { value: 500000, error: null } },
      ),
    ).toBe(true);
    expect(
      snapshotEqual(
        { derived: { value: 500000, error: null } },
        { derived: { value: 525000, error: null } },
      ),
    ).toBe(false);
    // The errors-array case.
    expect(snapshotEqual({ errors: ["Bad"] }, { errors: ["Bad"] })).toBe(
      true,
    );
    expect(snapshotEqual({ errors: ["Bad"] }, { errors: ["Worse"] })).toBe(
      false,
    );
    expect(snapshotEqual({ errors: null }, { errors: ["Bad"] })).toBe(false);
  });

  it("falls back to not-equal (re-render) for deeper nesting, never to equal", () => {
    expect(
      snapshotEqual(
        { input: { rows: [{ label: "a" }] } },
        { input: { rows: [{ label: "a" }] } },
      ),
    ).toBe(false);
  });
});
