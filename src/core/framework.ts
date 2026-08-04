/**
 * The reactive/environment seam the store implementation runs on.
 *
 * Store code imports its primitives from THIS module, never from `./signal`
 * directly, so core tests can mock the whole seam with plain-object signals
 * and a deterministic ID counter (the formisch mocked-signals pattern) and
 * assert store state independently of the signal implementation.
 */
export { batch, computed, createSignal, untrack } from "./signal";

/**
 * Counter backing `createId`.
 */
let idCounter = 0;

/**
 * Creates a unique ID (stable array item identity for keying and
 * reorder-aware state transfer).
 *
 * @returns The unique ID.
 */
export function createId(): string {
  return `${idCounter++}`;
}
