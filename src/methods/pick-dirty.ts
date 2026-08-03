import { getFieldBool } from "../core/field/get-field-bool";
import type { InternalFieldStore, InternalFormStore } from "../core/types";

/**
 * Picks only the dirty parts of the given value, using the form's dirty
 * fields as a structural mask while reading from the SUPPLIED value (e.g. a
 * validated output), not the form's own input. Arrays are treated as atomic
 * and object keys without a dirty descendant are omitted. Returns
 * `undefined` if no field is dirty or no dirty key is present in the value.
 *
 * @param form The form store providing the dirty mask.
 * @param from The value to filter down to its dirty parts.
 *
 * @returns The dirty parts of the value, or `undefined`.
 */
export function pickDirty(
  form: InternalFormStore,
  from: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!getFieldBool(form, "isDirty")) {
    return undefined;
  }

  const result = pickFieldValue(form, from);

  // Return undefined if no dirty property ended up in the result, which
  // can happen when every dirty key is absent from the supplied value
  return result && typeof result === "object" && Object.keys(result).length
    ? (result as Record<string, unknown>)
    : undefined;
}

/**
 * Recursively picks the dirty parts of a value using the field store as a
 * structural mask. Objects with present input recurse into their dirty
 * children that exist in the value; arrays, leaves, nullish-cleared
 * containers and shape-diverging values are returned as-is.
 */
function pickFieldValue(
  internalFieldStore: InternalFieldStore,
  value: unknown,
): unknown {
  if (
    internalFieldStore.kind === "object" &&
    internalFieldStore.input.value &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const result: Record<string, unknown> = {};
    for (const key in internalFieldStore.children) {
      const child = internalFieldStore.children[key];
      // Own-property check — a declared key like "toString" must never
      // match an inherited prototype member of the supplied value
      if (
        getFieldBool(child, "isDirty") &&
        Object.prototype.hasOwnProperty.call(value, key)
      ) {
        result[key] = pickFieldValue(
          child,
          (value as Record<string, unknown>)[key],
        );
      }
    }
    return result;
  }

  // Atomic or shape-diverging — return as-is
  return value;
}
