import {
  encodeFieldValue,
  fieldPluginDirty,
  hasPluginDirtyField,
} from "../plugin/driver";
import type { InternalFieldStore, InternalFormStore } from "../types";
import { getFieldBool } from "./get-field-bool";
import { getFieldInput } from "./get-field-input";
import { readOwn } from "../schema-utils";

/**
 * Returns only the dirty input of the field store. Arrays are treated as
 * atomic and returned in full if any item is dirty, while object keys
 * without a dirty descendant are omitted. Returns `undefined` if no
 * descendant is dirty.
 *
 * Plugin state serializes THROUGH the field's own entry (the LOS-573
 * envelope): a dirty estimate/amount-or-percent leaf emits
 * `{ value, source | entry }` in place of its bare value — a mode flip
 * with an unchanged value still produces a payload. Inside an emitted
 * array every envelope leaf is wrapped COMPLETE, dirty or not: rows
 * persist wholesale, and a bare value would clobber the persisted meta
 * half of its envelope.
 *
 * @param internalFormStore The form store (plugin state lives here).
 * @param internalFieldStore The field store to get dirty input from.
 *
 * @returns The dirty input, or `undefined` if no descendant is dirty.
 */
export function getDirtyFieldInput(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
): unknown {
  if (
    !getFieldBool(internalFieldStore, "isDirty") &&
    !hasPluginDirtyField(internalFormStore, internalFieldStore)
  ) {
    return undefined;
  }

  // Arrays are atomic — one dirty item (or one dirty row slot) returns the
  // whole current array, with every row's envelope leaves wrapped
  if (internalFieldStore.kind === "array") {
    return encodeScopeValues(
      internalFormStore,
      internalFieldStore,
      getFieldInput(internalFieldStore),
    );
  }

  // Objects recurse only into dirty children — a container child whose only
  // change is nested plugin state counts as dirty too
  if (internalFieldStore.kind === "object") {
    if (internalFieldStore.input.value) {
      const value: Record<string, unknown> = {};
      for (const key in internalFieldStore.children) {
        const child = internalFieldStore.children[key];
        if (child.kind === "value") {
          const valueDirty = getFieldBool(child, "isDirty");
          const pluginDirty = fieldPluginDirty(internalFormStore, child);
          if (!valueDirty && !pluginDirty) continue;
          const encoded = encodeFieldValue(
            internalFormStore,
            child,
            valueDirty ? child.input.value : undefined,
          );
          if (valueDirty || encoded !== undefined) {
            value[key] = encoded;
          }
        } else if (
          getFieldBool(child, "isDirty") ||
          hasPluginDirtyField(internalFormStore, child)
        ) {
          value[key] = getDirtyFieldInput(internalFormStore, child);
        }
      }
      return value;
    }
    return internalFieldStore.input.value;
  }

  return encodeFieldValue(
    internalFormStore,
    internalFieldStore,
    internalFieldStore.input.value,
  );
}

/**
 * Wraps the envelope leaves of an emitted subtree value: rows and nested
 * objects keep their shape, but every value leaf claimed by a plugin's
 * `encodeValue` (estimate/amount-or-percent) is replaced with its COMPLETE
 * envelope — the whole-array emission convention. The supplied value is
 * never mutated.
 */
export function encodeScopeValues(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore | undefined,
  value: unknown,
): unknown {
  if (!internalFieldStore) return value;

  if (internalFieldStore.kind === "array" && Array.isArray(value)) {
    return value.map((item, index) =>
      encodeScopeValues(
        internalFormStore,
        internalFieldStore.children[index],
        item,
      ),
    );
  }

  if (
    internalFieldStore.kind === "object" &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const row = { ...(value as Record<string, unknown>) };
    for (const key in internalFieldStore.children) {
      const child = internalFieldStore.children[key];
      if (child.kind === "value") {
        const present = Object.prototype.hasOwnProperty.call(row, key);
        if (present || fieldPluginDirty(internalFormStore, child)) {
          const encoded = encodeFieldValue(
            internalFormStore,
            child,
            readOwn(row, key),
          );
          if (encoded !== undefined) {
            row[key] = encoded;
          }
        }
      } else if (Object.prototype.hasOwnProperty.call(row, key)) {
        row[key] = encodeScopeValues(internalFormStore, child, row[key]);
      }
    }
    return row;
  }

  return value;
}
