/**
 * The result of parsing a formula expression: the engine's opaque AST node,
 * or a parse error. Shaped so a typical engine's parse result passes
 * through unchanged — jsonisch itself never depends on the engine.
 */
export type CalcParseResult =
  | { readonly ok: true; readonly node: unknown }
  | { readonly ok: false; readonly error: string };

/**
 * The injected calc engine, supplied by the host. Method syntax on
 * purpose: bivariant parameters let the engine's concrete AST type satisfy
 * the `unknown` node without an adapter layer —
 * `{ parse: parseFormula, evaluate: evaluateFormula, extractDependencies,
 * extractPathRefs }` passes through unchanged.
 */
export interface CalcEngine {
  /**
   * Parses a formula expression into an opaque AST node. Called once per
   * `x-formula` at store init.
   */
  parse(formula: string): CalcParseResult;
  /**
   * Evaluates a parsed node against a flat values scope. May throw (the
   * `#ERROR` contract) — the derivation layer contains the throw to the
   * field's own errors channel.
   */
  evaluate(node: unknown, scope: Record<string, unknown>): unknown;
  /**
   * Extracts the identifiers a formula reads: plain field refs plus
   * collection names of aggregate refs (`SUM(assets[aiv])` → `assets`).
   * Defines both the dep-graph edges and the eval-scope keys.
   */
  extractDependencies(node: unknown): string[];
  /**
   * Extracts `collection[field]` reference pairs. Optional: when present, a
   * formula with at least one such reference is classified a rollup (the
   * stricter-persistence set). A scalar record handle (`record[…]`) uses the
   * same syntax and currently also flags — shape-aware refinement belongs
   * to the persistence-rule slice.
   */
  extractPathRefs?(
    node: unknown,
  ): ReadonlyArray<{ readonly collection: string; readonly field: string }>;
}

/**
 * The mode of a formula field that accepts an estimate: `estimate` holds
 * the provisional manually-entered value (the field's own input signal);
 * `formula` computes. Estimate-first chronology — the formula supersedes
 * the estimate, never "overrides" it. Wire-compatible with the legacy
 * `<key>Source` companion's `manual` (→ `estimate`) / `formula` modes; the
 * companion decode itself is a later slice.
 */
export type DerivationMode = "estimate" | "formula";

/**
 * The output of a formula field's derived signal. `error` is the calc
 * error message (`null` when the evaluation succeeded); it feeds the
 * field's composed `errors` channel, where `#ERROR` rendering picks it up.
 */
export interface DerivedState {
  readonly value: unknown;
  readonly error: string | null;
}
