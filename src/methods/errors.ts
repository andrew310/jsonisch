import { getFieldStore } from "../core/field/get-field-store";
import { walkFieldStore } from "../core/field/walk-field-store";
import type { FieldErrors, Path } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Sets or clears the error messages of the field at the given path, or the
 * form-level (root) errors when no path is given. Useful for custom errors
 * that do not come from schema validation (e.g. a failed server action).
 *
 * @param form The form store to set errors on.
 * @param errors The error messages, or `null` to clear.
 * @param path The path to the field (omit for form-level errors).
 */
export function setErrors(
  form: FormRef,
  errors: FieldErrors,
  path?: Path,
): void {
  const internal = internalOf(form);
  (path ? getFieldStore(internal, path) : internal).validationErrors.value =
    errors;
}

/**
 * Retrieves the error messages of the field at the given path, or the
 * form-level (root) errors when no path is given. Does NOT include
 * descendants — use `getDeepErrors` for a subtree.
 *
 * @param form The form store to read errors from.
 * @param path The path to the field (omit for form-level errors).
 *
 * @returns The error messages, or `null`.
 */
export function getErrors(form: FormRef, path?: Path): FieldErrors {
  const internal = internalOf(form);
  return (path ? getFieldStore(internal, path) : internal).errors.value;
}

/**
 * Retrieves every error message of the field at the given path and all its
 * descendants (the entire form when no path is given), in depth-first
 * order. Form-level errors are included. This is what a checks panel sits
 * on — it surfaces errors of fields that are not currently rendered.
 *
 * @param form The form store to read errors from.
 * @param path The path to scope to (omit for the whole form).
 *
 * @returns The error messages, or `null` if none exist.
 */
export function getDeepErrors(form: FormRef, path?: Path): FieldErrors {
  const internal = internalOf(form);
  let deepErrors: [string, ...string[]] | null = null;
  walkFieldStore(
    path ? getFieldStore(internal, path) : internal,
    (internalFieldStore) => {
      const errors = internalFieldStore.errors.value;
      if (errors) {
        if (deepErrors) {
          deepErrors.push(...errors);
        } else {
          deepErrors = [...errors] as [string, ...string[]];
        }
      }
    },
  );
  return deepErrors;
}

/**
 * One deep-error entry: the erroring field's path and its messages.
 */
export interface DeepErrorEntry {
  /**
   * The path to the erroring field (`[]` for form-level errors).
   */
  readonly path: Path;
  /**
   * The error messages of the field.
   */
  readonly errors: [string, ...string[]];
}

/**
 * Retrieves every erroring field of the subtree at the given path (the
 * entire form when no path is given) as `{ path, errors }` entries in
 * depth-first order.
 *
 * @param form The form store to read errors from.
 * @param path The path to scope to (omit for the whole form).
 *
 * @returns The deep error entries (empty when none exist).
 */
export function getDeepErrorEntries(
  form: FormRef,
  path?: Path,
): DeepErrorEntry[] {
  const internal = internalOf(form);
  const entries: DeepErrorEntry[] = [];
  walkFieldStore(
    path ? getFieldStore(internal, path) : internal,
    (internalFieldStore) => {
      const errors = internalFieldStore.errors.value;
      if (errors) {
        entries.push({ path: [...internalFieldStore.path], errors });
      }
    },
  );
  return entries;
}
