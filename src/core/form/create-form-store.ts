import { buildDerivation } from "../derivation/build-derivation";
import { initializeFieldStore } from "../field/initialize-field-store";
import { createSignal } from "../framework";
import { buildMeta } from "../meta/build-meta";
import type { FormConfig, InternalFormStore } from "../types";

/**
 * The default empty input of a form. Required string fields start as an
 * empty string, while every other type starts as `undefined`.
 */
export const DEFAULT_EMPTY_INPUT: Record<string, unknown> = { string: "" };

/**
 * Creates a new internal form store from the provided configuration: walks
 * the JSON-Schema once and builds the field-store tree (`kind:
 * array|object|value`), with the schema as the allow-list — `initialInput`
 * keys not declared in the schema never enter form state.
 *
 * @param config The form configuration.
 *
 * @returns The internal form store.
 */
export function createFormStore(config: FormConfig): InternalFormStore {
  // The form root must be an object schema — a form is a keyed record
  if (!config.schema.properties || typeof config.schema.properties !== "object") {
    throw new Error(
      'The form schema must be an "object" schema with "properties"',
    );
  }

  const store: Partial<InternalFormStore> = {};

  // Merge configured empty input on top of the defaults before initializing
  // so the field stores can read it from the form store
  store.emptyInput = { ...DEFAULT_EMPTY_INPUT, ...config.emptyInput };

  // Set validation config (validator injected pre-compiled, once per schema)
  store.validator = config.validator;
  store.validate = config.validate ?? "submit";
  store.revalidate = config.revalidate ?? "input";
  store.validators = 0;

  // Initialize form state signals
  store.isSubmitting = createSignal(false);
  store.isSubmitted = createSignal(false);
  store.isValidating = createSignal(false);
  store.offFormValues = createSignal(config.offFormValues ?? {});

  // Initialize field store hierarchy from schema
  initializeFieldStore(
    store as InternalFormStore,
    store,
    config.schema,
    config.initialInput,
    [],
  );

  // Build the meta channel (companion decode → mode/entry state) BEFORE the
  // derivation graph, which reuses the estimate mode signal for its pin
  buildMeta(store as InternalFormStore, config.companions);

  // Build the derivation graph over the walked tree (root-level `x-formula`
  // fields become computed signals; no-op without an injected calc engine)
  buildDerivation(store as InternalFormStore, config.calcEngine);

  return store as InternalFormStore;
}
