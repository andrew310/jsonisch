import { isEmptyish } from "../../core/dirty";
import { mergeCollectionRows } from "../../core/derivation/merge-collection-rows";
import { getFieldInput } from "../../core/field/get-field-input";
import { computed } from "../../core/framework";
import type { JsonischPlugin } from "../../core/plugin/types";
import { readOwn } from "../../core/schema-utils";
import type {
  CalcEngine,
  DerivedState,
  FieldErrors,
  InternalFieldStore,
  InternalFormStore,
  InternalObjectStore,
  InternalValueStore,
} from "../../core/types";
import { envelopesKey } from "../envelopes/key";
import { derivationKey, type DerivationSlot } from "./key";
import { resolveRowFallback } from "./row-scope";

/**
 * The derivation plugin's state: one slot per formula/estimate value
 * store, keyed by store identity.
 */
export type DerivationState = Map<InternalFieldStore, DerivationSlot>;

/**
 * One scope formula: the field store it derives, the parsed AST (or the
 * parse error), and the identifiers the expression reads.
 */
interface FormulaEntry {
  store: InternalValueStore;
  node: unknown;
  deps: string[];
  parseError: string | null;
}

/**
 * Resolves a dependency that is NOT chained through a formula sibling in
 * the same scope: given the live form value the scope holds (`undefined`
 * when it holds none), returns the value the expression evaluates against.
 * The ONE place a scope's fill rules live — root-level fills from
 * `offFormValues`, a row fills from its canonical record.
 */
type ResolveOutside = (dep: string, formValue: unknown) => unknown;

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
 * The derivation plugin: parses every `x-formula` once per scope (the
 * document root and each array row — it is scope, not machinery, that
 * differs; LOS-596), breaks dependency cycles deterministically, and gives
 * each formula field its `formulaValue`/`derived` slot plus the composed
 * `errors` channel.
 *
 * Scope resolution lives HERE and only here (the LOS-514 closure — no
 * other read path exists): per dependency, the form value wins (a formula
 * dep resolves through its own derived signal, chaining fresh values),
 * `offFormValues` fills only `undefined`, and when both sides are arrays
 * the canonical rows merge with the live form rows (the collection
 * overlay for aggregate refs).
 *
 * Declares `dependsOn: [envelopesKey]` — the estimate pin reads the mode
 * signal the envelopes plugin creates; without it the pin would silently
 * never engage and a manually pinned value would be overwritten by the
 * next recompute (the D2 data-loss scenario), so a missing envelopes
 * plugin is a startup error instead.
 */
export function derivation(
  engine: CalcEngine,
): JsonischPlugin<DerivationState> {
  return {
    name: "derivation",
    key: derivationKey,
    dependsOn: [envelopesKey],

    build: () => new Map(),

    buildScope(ctx, scope) {
      const form = ctx.form;
      if (scope === (form as InternalObjectStore)) {
        wireFormulaGraph(form, ctx.state, engine, scope.children, (dep, formValue) => {
          const offValue = readOwn(form.offFormValues.value, dep);
          if (Array.isArray(offValue) && Array.isArray(formValue)) {
            // Collection overlay: canonical rows enriched by the live form
            // rows, membership from the live side
            return mergeCollectionRows(
              offValue as Array<Record<string, unknown>>,
              formValue,
            );
          }
          return formValue === undefined ? offValue : formValue;
        });
        return;
      }

      // A row's scope is its own record: live siblings in the SAME row win,
      // the canonical row from `offFormValues` (matched by `id`) fills what
      // the write model does not hold, and the parent-record handle rides
      // under `loan` — the precedence the server's own per-row recompute
      // evaluates against. Root-level form fields are deliberately NOT in
      // scope: a row formula that reached across into the document would
      // compute a different number here than on the server.
      wireFormulaGraph(form, ctx.state, engine, scope.children, (dep, formValue) =>
        resolveRowFallback(form, scope, dep, formValue),
      );
    },

    fieldSnapshot(ctx, store) {
      const slot = ctx.state.get(store);
      if (!slot) return {};
      return {
        derived: slot.derived.value,
        formulaValue: slot.formulaValue.value,
      };
    },
  };
}

declare module "../../react/types" {
  interface FieldStoreSlots {
    /**
     * The mode-aware derived output of a formula/estimate field (what the
     * field displays; an estimate pin holds the input). `undefined` on
     * non-derived fields or without the derivation plugin.
     */
    readonly derived: DerivedState | undefined;
    /**
     * The always-computed formula result of a formula/estimate field,
     * ignoring the estimate pin — the nudge's candidate value.
     */
    readonly formulaValue: DerivedState | undefined;
  }
}

/**
 * Wires the formula fields of ONE scope (the document root or a single
 * array row): collects the scope's parseable `x-formula` fields, breaks
 * cycles among them, and gives each one its slot. Everything
 * scope-specific enters through `resolveOutside`.
 */
function wireFormulaGraph(
  form: InternalFormStore,
  state: DerivationState,
  engine: CalcEngine,
  children: Record<string, InternalFieldStore>,
  resolveOutside: ResolveOutside,
): void {
  // Collect the scope's formula fields in schema property order (the
  // deterministic order every later step — cycle break included — runs in)
  const entries = new Map<string, FormulaEntry>();
  for (const key of Object.keys(children)) {
    const child = children[key];
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
      state.set(child, {
        derived: passthrough,
        formulaValue: passthrough,
        isRollup: false,
      });
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
  // the scope's fill) instead of recursing.
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
    const child = children[dep];
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
        // user sees may descend from a broken formula. The slot is read
        // lazily at evaluation time, when the whole scope is wired.
        const depState = state.get(child)!.derived.value;
        if (depState.error !== null) {
          throw new Error(`Upstream formula error: "${dep}"`);
        }
        formValue = depState.value;
      } else {
        formValue = getFieldInput(child);
      }
    }
    return resolveOutside(dep, formValue);
  };

  // Wire each formula field: the always-computed formula result, the
  // mode-aware derived signal (estimate pin wins), and the composed errors
  // channel
  for (const [key, entry] of entries) {
    const { store } = entry;

    const isRollup =
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

    // The output dependents chain through and the field displays: the
    // estimate pin wins — hold the manual value, read no deps (so dep edits
    // do not recompute a pinned field; the lazy computed only touches
    // `formulaValue` when unpinned). An EMPTY estimate does NOT pin — the
    // settled LOS-515 rule ("empty manual → silent takeover"): dependents
    // read the formula result until a real estimate is typed, matching the
    // server recompute's fall-through. The mode signal is the envelopes
    // plugin's (`dependsOn` guarantees it was built first); read lazily
    // through the key on every evaluation.
    const derived =
      store.control === "estimate"
        ? computed<DerivedState>(() => {
            const envelope = envelopesKey.get(form, store);
            return envelope?.family === "source" &&
              envelope.mode.value === "estimate" &&
              !isEmptyish(store.input.value)
              ? { value: store.input.value, error: null }
              : formulaValue.value;
          })
        : formulaValue;

    state.set(store, { derived, formulaValue, isRollup });

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
