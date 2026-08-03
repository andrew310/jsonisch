/**
 * Plain-object mocks for the `core/framework` seam (the formisch
 * mocked-signals pattern): core store tests run with ZERO reactivity and
 * assert state, not subscriptions. The real signal implementation gets its
 * own tests (`signal.test.ts`, `useSignals`).
 *
 * Test files wire this in with:
 *
 * ```ts
 * const { frameworkMocks, resetIdCounter } = await vi.hoisted(
 *   async () => await import("../vitest/mock"),
 * );
 * vi.mock("../framework", () => frameworkMocks);
 * beforeEach(resetIdCounter);
 * ```
 */
import type { Signal } from "../signal";

let idCounter = 0;

function createSignal<T>(): Signal<T | undefined>;
function createSignal<T>(value: T): Signal<T>;
function createSignal(value?: unknown): Signal<unknown> {
  return { value };
}

function batch<T>(fn: () => T): T {
  return fn();
}

function untrack<T>(fn: () => T): T {
  return fn();
}

function createId(): string {
  return `id-${idCounter++}`;
}

/**
 * Resets the deterministic ID counter (run in `beforeEach` so generated IDs
 * are stable per test).
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Mock implementations for the `core/framework` module.
 */
export const frameworkMocks = {
  createSignal,
  batch,
  untrack,
  createId,
};
