import { focusFieldElement } from "../core/field/focus-field-element";
import { getFieldStore } from "../core/field/get-field-store";
import type { Path } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Focuses the first focusable element of the field at the given path.
 * Detached, disabled or hidden elements are skipped.
 *
 * @param form The form store containing the field.
 * @param path The path to the field to focus.
 */
export function focus(form: FormRef, path: Path): void {
  focusFieldElement(getFieldStore(internalOf(form), path));
}
