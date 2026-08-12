import {
  encodeScopeValues,
} from "../core/field/get-dirty-field-input";
import { getFieldBool } from "../core/field/get-field-bool";
import {
  encodeFieldValue,
  fieldPluginDirty,
  hasPluginDirtyField,
} from "../core/plugin/driver";
import type { InternalFieldStore, InternalFormStore } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Picks only the dirty parts of the given value, using the form's dirty
 * fields as a structural mask while reading from the SUPPLIED value (e.g. a
 * validated output), not the form's own input. Arrays are treated as atomic
 * and object keys without a dirty descendant are omitted. Returns
 * `undefined` if no field is dirty or no dirty key is present in the value.
 *
 * Envelope leaves (estimate/amount-or-percent) emit their COMPLETE
 * kind envelope — the plugin wraps the supplied
 * value with its meta half, and a leaf whose only change is plugin state
 * (a mode flip) still emits.
 *
 * @param form The form store providing the dirty mask.
 * @param from The value to filter down to its dirty parts.
 *
 * @returns The dirty parts of the value, or `undefined`.
 */
export function pickDirty(
  form: FormRef,
  from: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const internal = internalOf(form);
  if (
    !getFieldBool(internal, "isDirty") &&
    !hasPluginDirtyField(internal, internal)
  ) {
    return undefined;
  }

  const result = pickFieldValue(internal, internal, from);

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
 * containers and shape-diverging values are returned as-is (arrays with
 * their envelope leaves wrapped).
 */
function pickFieldValue(
  internalFormStore: InternalFormStore,
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
      const present = Object.prototype.hasOwnProperty.call(value, key);

      if (child.kind === "value") {
        const valueDirty = getFieldBool(child, "isDirty");
        const pluginDirty = fieldPluginDirty(internalFormStore, child);
        // A dirty plugin half serializes from the store even when the
        // supplied value does not carry the key (meta state never appears
        // in validated output)
        if (!(valueDirty && present) && !pluginDirty) continue;
        const encoded = encodeFieldValue(
          internalFormStore,
          child,
          valueDirty && present
            ? (value as Record<string, unknown>)[key]
            : undefined,
        );
        if ((valueDirty && present) || encoded !== undefined) {
          result[key] = encoded;
        }
      } else if (
        (getFieldBool(child, "isDirty") ||
          hasPluginDirtyField(internalFormStore, child)) &&
        present
      ) {
        result[key] = pickFieldValue(
          internalFormStore,
          child,
          (value as Record<string, unknown>)[key],
        );
      }
    }
    return result;
  }

  // An array is atomic, but every row's envelope leaves are wrapped with
  // their complete envelopes — rows persist wholesale, and a bare value
  // would clobber the persisted meta half
  if (internalFieldStore.kind === "array") {
    return encodeScopeValues(internalFormStore, internalFieldStore, value);
  }

  // Atomic or shape-diverging — return as-is
  return value;
}
