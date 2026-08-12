import { getFieldStore } from "../field/get-field-store";
import { createFormStore } from "../form/create-form-store";
import { envelopes } from "../../plugins/envelopes/plugin";
import { derivation } from "../../plugins/derivation/plugin";
import { visibility } from "../../plugins/visibility/plugin";
import type { PluginsInput } from "../plugin/types";
import type {
  CalcEngine,
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
  /**
   * The calc engine the derivation plugin is registered with. Omit for a
   * form with no derivation (envelopes + visibility still register — the
   * standard trio minus the engine-dependent member).
   */
  engine?: CalcEngine;
  offFormValues?: Record<string, unknown>;
  emptyInput?: Record<string, unknown>;
  validator?: FormValidator;
  validate?: ValidationMode;
  revalidate?: Exclude<ValidationMode, "initial">;
}

/**
 * Builds the standard first-party plugin trio in its required array order:
 * envelopes first (derivation `dependsOn` it and throws otherwise),
 * derivation only when an engine is supplied, visibility last (a WHEN
 * watching a formula field resolves through its derived slot).
 *
 * @param engine The calc engine, or `undefined` for no derivation.
 *
 * @returns The plugins array for `createFormStore`.
 */
export function testPlugins(engine?: CalcEngine): PluginsInput {
  return [envelopes(), engine && derivation(engine), visibility()];
}

/**
 * Creates a form store for testing, with the standard plugin trio
 * registered.
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
  const { engine, ...rest } = config;
  return createFormStore({ schema, ...rest, plugins: testPlugins(engine) });
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
