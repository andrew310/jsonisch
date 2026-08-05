import { isEmptyish } from "../dirty";
import { getFieldInput } from "../field/get-field-input";
import { computed } from "../framework";
import { readOwn } from "../schema-utils";
import type {
  CalcEngine,
  DerivedState,
  FieldErrors,
  InternalFormStore,
  InternalValueStore,
} from "../types";
import { mergeCollectionRows } from "./merge-collection-rows";

/**
 * One document formula: the field store it derives, the parsed AST (or the
 * parse error), and the identifiers the expression reads.
 */
interface FormulaEntry {
  store: InternalValueStore;
  node: unknown;
  deps: string[];
  parseError: string | null;
}

/**
 * Key for a directed dep-graph edge (`from` reads `to`).
 */
function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

/**
 * Extracts a human-readable message from a thrown evaluation error.
 */
function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

/**
 * Builds the derivation graph over a walked form store: parses every
 * root-level `x-formula` once, breaks dependency cycles deterministically,
 * and turns each formula field into a computed signal over its deps' input
 * signals + `offFormValues`.
 *
 * Scope resolution lives HERE and only here (the LOS-514 closure — no other
 * read path exists): per dependency, the form value wins (including an
 * explicit `null`; a formula dep resolves through its own derived signal,
 * chaining fresh values), `offFormValues` fills only `undefined` (so a
 * schema-absent/soft-deleted field still resolves), and when both sides are
 * arrays the canonical rows are merged with the live form rows
 * (`mergeCollectionRows` — the collection overlay for aggregate refs).
 *
 * Derived values are outputs: nothing here writes back into `input`, so
 * they are excluded from dirty and payload by construction (`encodeDirty`'s
 * skip stays as defense-in-depth).
 *
 * Calc errors (a throwing evaluation, a parse failure, a broken cycle) land
 * in the field's composed `errors` signal WITHOUT touching
 * `validationErrors`, so validation passes and calc errors can never
 * clobber each other; an erroring formula PROPAGATES to its dependents
 * ("Upstream formula error") — a dependent must never show a stale
 * persisted value or a plausible null-derived number in place of its
 * broken chain — and never poisons siblings.
 *
 * v1c boundary: only ROOT-LEVEL formula fields derive. A formula declared
 * inside an array item schema is walked as a plain value leaf — per-row
 * formulas reach forms pre-evaluated in their collection's canonical rows
 * (PR #459's server-side flatten), matching the current stack.
 */
export function buildDerivation(
  internalFormStore: InternalFormStore,
  engine: CalcEngine | undefined,
): void {
  if (!engine) return;

  // Collect the document's formula fields in schema property order (the
  // deterministic order every later step — cycle break included — runs in)
  const entries = new Map<string, FormulaEntry>();
  for (const key of Object.keys(internalFormStore.children)) {
    const child = internalFormStore.children[key];
    if (child.kind !== "value") continue;
    if (child.control !== "formula" && child.control !== "estimate") continue;
    // `x-server-maintained`: a dedicated server process owns the persisted
    // value (the formula is documentation — its deps may be read-time-only
    // scope the form never has). The field still renders as a formula
    // widget, so its derived channel passes the STORED input through
    // verbatim; it never enters the dep graph, and a formula that reads it
    // resolves through the same stored value.
    if (child.schema["x-server-maintained"] === true) {
      const passthrough = computed<DerivedState>(() => ({
        value: getFieldInput(child),
        error: null,
      }));
      child.formulaValue = passthrough;
      child.derived = passthrough;
      child.isRollup = false;
      continue;
    }
    const formula = child.schema["x-formula"];
    if (typeof formula !== "string" || formula.trim() === "") continue;

    const parsed = engine.parse(formula);
    entries.set(key, {
      store: child,
      node: parsed.ok ? parsed.node : undefined,
      deps: parsed.ok ? engine.extractDependencies(parsed.node) : [],
      parseError: parsed.ok ? null : parsed.error,
    });
  }
  if (entries.size === 0) return;

  // Break cycles deterministically (DFS in property order, same algorithm
  // as the app's recompute pass): an edge back into a field still on the
  // DFS stack — self-references included — is cut, and the field holding
  // the cut edge is flagged with a persistent calc error. Evaluation then
  // resolves the cut dep through the non-derived path (its input signal /
  // `offFormValues`) instead of recursing.
  const brokenEdges = new Set<string>();
  const cycleErrors = new Map<string, string>();
  const dfsState = new Map<string, "visiting" | "done">();
  const visit = (key: string): void => {
    dfsState.set(key, "visiting");
    for (const dep of entries.get(key)!.deps) {
      if (!entries.has(dep)) continue;
      if (dep === key || dfsState.get(dep) === "visiting") {
        brokenEdges.add(edgeKey(key, dep));
        cycleErrors.set(key, `Circular reference: "${key}" reads "${dep}"`);
        continue;
      }
      if (dfsState.get(dep) !== "done") visit(dep);
    }
    dfsState.set(key, "done");
  };
  for (const key of entries.keys()) {
    if (!dfsState.has(key)) visit(key);
  }

  // Resolve one dependency through the single scope path
  const resolveDep = (fromKey: string, dep: string): unknown => {
    const child = internalFormStore.children[dep];
    let formValue: unknown;
    if (child) {
      const depEntry = child.kind === "value" ? entries.get(dep) : undefined;
      if (
        depEntry &&
        depEntry.store === child &&
        !brokenEdges.has(edgeKey(fromKey, dep))
      ) {
        // A formula dep chains through its derived signal — always fresh,
        // never the possibly-stale stored input. An erroring upstream
        // propagates (caught by the dependent's computed): no number a
        // user sees may descend from a broken formula.
        const depState = depEntry.store.derived!.value;
        if (depState.error !== null) {
          throw new Error(`Upstream formula error: "${dep}"`);
        }
        formValue = depState.value;
      } else {
        formValue = getFieldInput(child);
      }
    }
    const offValue = readOwn(internalFormStore.offFormValues.value, dep);
    if (Array.isArray(offValue) && Array.isArray(formValue)) {
      // Collection overlay: canonical rows enriched by the live form rows,
      // membership from the live side
      return mergeCollectionRows(
        offValue as Array<Record<string, unknown>>,
        formValue,
      );
    }
    return formValue === undefined ? offValue : formValue;
  };

  // Wire each formula field: the always-computed formula result, the
  // mode-aware derived signal (estimate pin wins), and the composed errors
  // channel
  for (const [key, entry] of entries) {
    const { store } = entry;

    // The estimate mode signal was created by the meta channel pass
    // (companion decode / presence heuristic) before derivation runs
    const mode = store.mode;

    store.isRollup =
      entry.parseError === null &&
      (engine.extractPathRefs?.(entry.node)?.length ?? 0) > 0;

    const cycleError = cycleErrors.get(key) ?? null;

    // The candidate: what the formula computes right now, regardless of the
    // pin — the estimate wrapper's nudge compares against this, and a
    // formula→estimate flip seeds from it
    const formulaValue = computed<DerivedState>(() => {
      if (entry.parseError !== null) {
        return { value: undefined, error: entry.parseError };
      }
      try {
        const scope: Record<string, unknown> = Object.create(null);
        for (const dep of entry.deps) {
          scope[dep] = resolveDep(key, dep);
        }
        return { value: engine.evaluate(entry.node, scope), error: cycleError };
      } catch (error) {
        return { value: undefined, error: cycleError ?? messageOf(error) };
      }
    });
    store.formulaValue = formulaValue;

    // The output dependents chain through and the field displays: the
    // estimate pin wins — hold the manual value, read no deps (so dep edits
    // do not recompute a pinned field; the lazy computed only touches
    // `formulaValue` when unpinned). An EMPTY estimate does NOT pin — the
    // settled LOS-515 rule ("empty manual → silent takeover"): dependents
    // read the formula result until a real estimate is typed, matching the
    // server recompute's fall-through and janska's eval-base behavior.
    const derived =
      store.control === "estimate"
        ? computed<DerivedState>(() =>
            mode?.value === "estimate" && !isEmptyish(store.input.value)
              ? { value: store.input.value, error: null }
              : formulaValue.value,
          )
        : formulaValue;
    store.derived = derived;

    // Compose the read channel: validation issues and the calc error
    // coexist; each side clears independently
    store.errors = computed<FieldErrors>(() => {
      const validation = store.validationErrors.value;
      const calc = derived.value.error;
      if (calc === null) return validation;
      return validation ? [...validation, calc] : [calc];
    });
  }
}
