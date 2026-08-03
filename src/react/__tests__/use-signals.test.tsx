// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useEffect, useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batch,
  createSignal,
  computed,
  getListener,
  type Listener,
} from "../../core/signal";
import { useSignals } from "../use-signals";

// Repo gotcha: vitest runs without globals, so React Testing Library's
// auto-cleanup never registers — clean up explicitly.
afterEach(() => {
  cleanup();
});

describe("useSignals", () => {
  it("re-renders the component when a signal it read changes", () => {
    const signal = createSignal("initial");

    function Reader(): ReactElement {
      useSignals();
      return <span data-testid="value">{signal.value}</span>;
    }

    const { getByTestId } = render(<Reader />);
    expect(getByTestId("value").textContent).toBe("initial");

    act(() => {
      signal.value = "updated";
    });
    expect(getByTestId("value").textContent).toBe("updated");
  });

  it("does not re-render for signals it did not read", () => {
    const read = createSignal("read");
    const unread = createSignal("unread");
    let renderCount = 0;

    function PartialReader(): ReactElement {
      useSignals();
      renderCount++;
      return <span>{read.value}</span>;
    }

    render(<PartialReader />);
    const initialRenderCount = renderCount;

    act(() => {
      unread.value = "changed";
    });
    expect(renderCount).toBe(initialRenderCount);
  });

  it("re-renders when a read computed's dependency changes", () => {
    const source = createSignal(2);
    const doubled = computed(() => source.value * 2);

    function ComputedReader(): ReactElement {
      useSignals();
      return <span data-testid="value">{doubled.value}</span>;
    }

    const { getByTestId } = render(<ComputedReader />);
    expect(getByTestId("value").textContent).toBe("4");

    act(() => {
      source.value = 5;
    });
    expect(getByTestId("value").textContent).toBe("10");
  });

  it("re-renders once for a batched multi-signal update", () => {
    const a = createSignal(1);
    const b = createSignal(2);
    let renderCount = 0;

    function SumReader(): ReactElement {
      useSignals();
      renderCount++;
      return <span data-testid="sum">{a.value + b.value}</span>;
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

  it("unsubscribes on unmount", () => {
    vi.useFakeTimers();
    try {
      const signal = createSignal("alive");
      let componentListener: Listener | undefined;
      let renderCount = 0;

      function Reader(): ReactElement {
        useSignals();
        componentListener = getListener();
        renderCount++;
        return <span>{signal.value}</span>;
      }

      const { unmount } = render(<Reader />);
      expect(componentListener).toBeDefined();
      expect(componentListener!.subscriptions.size).toBe(1);

      unmount();
      // Teardown is deferred one macrotask (StrictMode guard) — flush it.
      act(() => {
        vi.runAllTimers();
      });

      expect(componentListener!.subscriptions.size).toBe(0);
      const renderCountAfterUnmount = renderCount;
      signal.value = "after-unmount";
      expect(renderCount).toBe(renderCountAfterUnmount);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps subscriptions alive across StrictMode's synthetic remount", () => {
    const signal = createSignal(0);

    function Reader(): ReactElement {
      useSignals();
      return <span data-testid="value">{signal.value}</span>;
    }

    // StrictMode mounts, runs effect cleanup, and re-runs effects. The
    // deferred teardown must be cancelled by the effect re-run so the
    // subscription survives.
    const { getByTestId } = render(
      <StrictMode>
        <Reader />
      </StrictMode>,
    );

    act(() => {
      signal.value = 7;
    });
    expect(getByTestId("value").textContent).toBe("7");
  });

  it("only re-renders the components that read the changed signal", () => {
    const a = createSignal("a0");
    const b = createSignal("b0");
    let renderCountA = 0;
    let renderCountB = 0;

    function ReaderA(): ReactElement {
      useSignals();
      renderCountA++;
      return <span data-testid="a">{a.value}</span>;
    }

    function ReaderB(): ReactElement {
      useSignals();
      renderCountB++;
      return <span data-testid="b">{b.value}</span>;
    }

    const { getByTestId } = render(
      <>
        <ReaderA />
        <ReaderB />
      </>,
    );
    const initialA = renderCountA;
    const initialB = renderCountB;

    act(() => {
      a.value = "a1";
    });
    expect(getByTestId("a").textContent).toBe("a1");
    expect(getByTestId("b").textContent).toBe("b0");
    expect(renderCountA - initialA).toBe(1);
    expect(renderCountB).toBe(initialB);
  });

  it("tracks conditional reads render by render", () => {
    const which = createSignal<"first" | "second">("first");
    const first = createSignal("F0");
    const second = createSignal("S0");

    function ConditionalReader(): ReactElement {
      useSignals();
      const value = which.value === "first" ? first.value : second.value;
      return <span data-testid="value">{value}</span>;
    }

    const { getByTestId } = render(<ConditionalReader />);
    expect(getByTestId("value").textContent).toBe("F0");

    act(() => {
      which.value = "second";
    });
    expect(getByTestId("value").textContent).toBe("S0");

    // After the switch, `second` is tracked...
    act(() => {
      second.value = "S1";
    });
    expect(getByTestId("value").textContent).toBe("S1");
  });

  it("coexists with useState in the same component", () => {
    const signal = createSignal("sig0");

    function Mixed(): ReactElement {
      useSignals();
      const [count, setCount] = useState(0);
      return (
        <div>
          <span data-testid="count">{count}</span>
          <span data-testid="signal">{signal.value}</span>
          <button type="button" onClick={() => setCount((c) => c + 1)}>
            inc
          </button>
        </div>
      );
    }

    const { getByTestId, getByText } = render(<Mixed />);

    act(() => {
      getByText("inc").click();
    });
    expect(getByTestId("count").textContent).toBe("1");
    expect(getByTestId("signal").textContent).toBe("sig0");

    act(() => {
      signal.value = "sig1";
    });
    expect(getByTestId("count").textContent).toBe("1");
    expect(getByTestId("signal").textContent).toBe("sig1");
  });

  it("clears the active listener after commit (no tracking leaks into effects/handlers)", () => {
    const signal = createSignal(0);
    let listenerDuringEffect: Listener | undefined;
    let effectRan = false;

    function Reader(): ReactElement {
      useSignals();
      useEffect(() => {
        // Post-commit: the render-phase listener must be cleared so reads in
        // effects and event handlers never subscribe the component.
        listenerDuringEffect = getListener();
        effectRan = true;
      });
      return <span>{signal.value}</span>;
    }

    render(<Reader />);
    expect(effectRan).toBe(true);
    expect(listenerDuringEffect).toBeUndefined();
  });
});
