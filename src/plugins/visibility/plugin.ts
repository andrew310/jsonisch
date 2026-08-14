import { computed } from "../../core/framework";
import { PluginKey } from "../../core/plugin/key";
import type { JsonischPlugin } from "../../core/plugin/types";
import { readOwn } from "../../core/schema-utils";
import type { InternalFormStore, InternalObjectStore } from "../../core/types";
import type { VisibleWhen } from "../../core/types/visibility";
import { resolveConditionals } from "../../core/visibility/resolve-conditionals";
import { resolveScopeValue } from "../derivation/resolve-scope-value";
import { resolveRowScopeValue } from "../derivation/row-scope";

/**
 * The visibility plugin's key. It keeps no state (rules and computeds live
 * on the field stores' base `visibleWhen`/`visible` members).
 */
export const visibilityKey = new PluginKey<null>("visibility");

/**
 * The visibility plugin: every field gated by an `allOf` `if/then/else`
 * block on its OWN scope's schema gets a `visible` computed signal over the
 * watched field's resolved value. Two scope kinds (LOS-722 extended
 * visibility into rows — the spec's open question 3):
 *
 * - the root scope, whose rules come from the form schema's `allOf`;
 * - an array-row scope, whose rules come from the ITEMS schema's `allOf`
 *   (`buildNestedFieldItems` carries the related dataset's conditionals),
 *   evaluated against THAT row's values — row A's trigger never gates
 *   row B's field.
 *
 * Visibility gates RENDERING only: a hidden field keeps its state, stays
 * in the dirty diff, and rides the payload. Fields without a rule get no
 * signal — the public store reads that as always visible.
 *
 * Register AFTER derivation (array order): a WHEN watching a formula field
 * resolves through its derived slot. No hard `dependsOn` — a form without
 * a calc engine legitimately omits derivation, and the watched-value read
 * falls back to the field's input.
 */
export function visibility(): JsonischPlugin<null> {
  return {
    name: "visibility",
    key: visibilityKey,

    build: () => null,

    buildScope(ctx, scope) {
      const form = ctx.form;
      const isRoot = scope === (form as InternalObjectStore);

      const rules = resolveConditionals(scope.schema);
      for (const [key, visibleWhen] of Object.entries(rules)) {
        const child = readOwn(scope.children, key);
        if (!child || typeof child !== "object") continue;
        const store = scope.children[key]!;
        store.visibleWhen = visibleWhen;
        store.visible = isRoot
          ? computed(() => evaluateVisibleWhen(form, visibleWhen))
          : computed(() => evaluateRowVisibleWhen(form, scope, visibleWhen));
      }
    },
  };
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
  return compareVisibleWhen(actual, visibleWhen);
}

/**
 * Evaluates a ROW field's visibility rule in its row's scope: the watched
 * value resolves through `resolveRowScopeValue` (live row sibling,
 * derived-aware → canonical row from `offFormValues`), so toggling row A's
 * trigger flips row A's gated field and no other row's.
 */
function evaluateRowVisibleWhen(
  internalFormStore: InternalFormStore,
  rowScope: InternalObjectStore,
  visibleWhen: VisibleWhen,
): boolean {
  const actual = resolveRowScopeValue(
    internalFormStore,
    rowScope,
    visibleWhen.field,
  );
  return compareVisibleWhen(actual, visibleWhen);
}

function compareVisibleWhen(actual: unknown, visibleWhen: VisibleWhen): boolean {
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
