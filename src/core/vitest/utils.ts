import { getFieldStore } from "../field/get-field-store";
import { createFormStore } from "../form/create-form-store";
import type {
  FieldElement,
  FormValidator,
  InternalArrayStore,
  InternalFormStore,
  InternalObjectStore,
  InternalValueStore,
  JsonSchema,
  Path,
  ValidationIssue,
  ValidationMode,
} from "../types";

/**
 * Configuration options for creating a test store.
 */
interface CreateTestStoreConfig {
  initialInput?: unknown;
  offFormValues?: Record<string, unknown>;
  emptyInput?: Record<string, unknown>;
  validator?: FormValidator;
  validate?: ValidationMode;
  revalidate?: Exclude<ValidationMode, "initial">;
}

/**
 * Creates a form store for testing.
 *
 * @param schema The JSON-Schema for the form.
 * @param config Optional configuration for the store.
 *
 * @returns An internal form store for testing.
 */
export function createTestStore(
  schema: JsonSchema,
  config: CreateTestStoreConfig = {},
): InternalFormStore {
  return createFormStore({ schema, ...config });
}

/**
 * Builds an AJV-shaped validation issue for a JSON-Pointer instance path.
 */
export function issue(
  instancePath: string,
  message: string,
  extra?: Partial<ValidationIssue>,
): ValidationIssue {
  return { instancePath, message, ...extra };
}

/**
 * Builds an AJV-shaped `required` issue: the instance path points at the
 * object; the missing property rides in `params`.
 */
export function requiredIssue(
  instancePath: string,
  missingProperty: string,
): ValidationIssue {
  return {
    instancePath,
    keyword: "required",
    message: `must have required property '${missingProperty}'`,
    params: { missingProperty },
  };
}

/**
 * A validator that always returns the same canned issues (`null` for a
 * validator that always passes).
 */
export function staticValidator(
  issues: readonly ValidationIssue[] | null,
): FormValidator {
  return () => issues;
}

/**
 * A fake focusable element for node-environment tests: `focus()` records
 * the element as its root's `activeElement`, which is exactly what
 * `focusFieldElement` reads back.
 */
export function focusableElement(): FieldElement & { focused: boolean } {
  const root = { activeElement: null as unknown };
  const element = {
    focused: false,
    focus() {
      root.activeElement = element;
      element.focused = true;
    },
    getRootNode: () => root,
  };
  return element as unknown as FieldElement & { focused: boolean };
}

/**
 * Shorthand for an object schema where EVERY property is required (the
 * common fixture shape; pass `required` to override).
 */
export function objectSchema(
  properties: Record<string, JsonSchema>,
  required?: string[],
): JsonSchema {
  return {
    type: "object",
    properties,
    required: required ?? Object.keys(properties),
  };
}

/**
 * Resolves the field store at a path and narrows it to a value store.
 */
export function getValueStore(
  form: InternalFormStore,
  path: Path,
): InternalValueStore {
  const store = getFieldStore(form, path);
  if (store.kind !== "value") {
    throw new Error(`Expected value store at ${JSON.stringify(path)}, got "${store.kind}"`);
  }
  return store;
}

/**
 * Resolves the field store at a path and narrows it to an array store.
 */
export function getArrayStore(
  form: InternalFormStore,
  path: Path,
): InternalArrayStore {
  const store = getFieldStore(form, path);
  if (store.kind !== "array") {
    throw new Error(`Expected array store at ${JSON.stringify(path)}, got "${store.kind}"`);
  }
  return store;
}

/**
 * Resolves the field store at a path and narrows it to an object store.
 */
export function getObjectStore(
  form: InternalFormStore,
  path: Path,
): InternalObjectStore {
  const store = getFieldStore(form, path);
  if (store.kind !== "object") {
    throw new Error(`Expected object store at ${JSON.stringify(path)}, got "${store.kind}"`);
  }
  return store;
}
