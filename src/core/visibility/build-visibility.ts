import { resolveScopeValue } from "../derivation/resolve-scope-value";
import { computed } from "../framework";
import { readOwn } from "../schema-utils";
import type { InternalFormStore } from "../types";
import type { VisibleWhen } from "../types/visibility";
import { resolveConditionals } from "./resolve-conditionals";

/**
 * Builds conditional visibility over the walked tree: every root-level
 * field gated by an `allOf` `if/then/else` block gets a `visible` computed
 * signal over the watched field's resolved value. Root-level only — the
 * same boundary as derivation and the meta channel.
 *
 * Visibility gates RENDERING only: a hidden field keeps its state, stays
 * in the dirty diff, and rides the payload (the spec's "visibleWhen
 * retains hidden values"). Fields without a rule get no signal — the
 * public store reads that as always visible.
 *
 * @param internalFormStore The form store (children already walked).
 */
export function buildVisibility(internalFormStore: InternalFormStore): void {
  const rules = resolveConditionals(internalFormStore.schema);
  for (const [key, visibleWhen] of Object.entries(rules)) {
    const child = readOwn(internalFormStore.children, key);
    if (!child || typeof child !== "object") continue;
    const store = internalFormStore.children[key]!;
    store.visibleWhen = visibleWhen;
    store.visible = computed(() =>
      evaluateVisibleWhen(internalFormStore, visibleWhen),
    );
  }
}

/**
 * Evaluates a visibility rule against the canonical scope: the form value
 * wins, `offFormValues` fills what the form does not hold — so a WHEN can
 * watch an off-stage loan field, and (via the `loan[key]` bracket form) a
 * parent-record handle field from an asset schema (LOS-471).
 */
function evaluateVisibleWhen(
  internalFormStore: InternalFormStore,
  visibleWhen: VisibleWhen,
): boolean {
  const actual = resolveWhenRef(internalFormStore, visibleWhen.field);
  switch (visibleWhen.op) {
    case "equals":
      return actual === visibleWhen.value;
    case "not-equals":
      return actual !== visibleWhen.value;
    case "contains":
      return Array.isArray(actual) && actual.includes(visibleWhen.value);
    case "not-contains":
      return !Array.isArray(actual) || !actual.includes(visibleWhen.value);
  }
}

/**
 * Resolves a watched-field reference. Two shapes, mirroring the formula
 * grammar: a plain root key resolves through the scope precedence; the
 * bracket form `loan[key]` reads `key` off the OBJECT the scope holds
 * under `loan` (the parent-record handle). An absent or non-object handle
 * resolves `undefined`, so an equals-gated field simply stays hidden —
 * e.g. in a host with no parent record in scope.
 */
function resolveWhenRef(
  internalFormStore: InternalFormStore,
  ref: string,
): unknown {
  const open = ref.indexOf("[");
  if (open > 0 && ref.endsWith("]")) {
    const base = resolveScopeValue(internalFormStore, ref.slice(0, open));
    if (base && typeof base === "object" && !Array.isArray(base)) {
      return readOwn(base, ref.slice(open + 1, -1));
    }
    return undefined;
  }
  return resolveScopeValue(internalFormStore, ref);
}
