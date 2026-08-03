import { getFieldStore } from "../field/get-field-store";
import { createFormStore } from "../form/create-form-store";
import type {
  InternalArrayStore,
  InternalFormStore,
  InternalObjectStore,
  InternalValueStore,
  JsonSchema,
  Path,
} from "../types";

/**
 * Configuration options for creating a test store.
 */
interface CreateTestStoreConfig {
  initialInput?: unknown;
  offFormValues?: Record<string, unknown>;
  emptyInput?: Record<string, unknown>;
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
