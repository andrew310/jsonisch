import { getFieldBool } from "../field/get-field-bool";
import { initializeFieldStore } from "../field/initialize-field-store";
import { computed, createSignal } from "../framework";
import {
  dispatchBuild,
  dispatchBuildScope,
  pluginsDirty,
  resolvePlugins,
} from "../plugin/driver";
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
 * Plugins are resolved and their state containers created BEFORE the walk,
 * so the walk can dispatch `buildScope` for every array-item object it
 * creates (a row wired by the walk behaves exactly like one built later by
 * an insert). The ROOT scope is dispatched after the walk, in plugin array
 * order — for the standard trio that means envelopes (the estimate pin's
 * mode signal) before derivation before visibility.
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

  // Resolve plugins and create their state containers before the walk —
  // duplicate names/keys, unknown hooks and missing dependencies throw here
  store.pluginDriver = resolvePlugins(config.plugins);
  store.pluginState = new Map();

  // Initialize form state signals
  store.isSubmitting = createSignal(false);
  store.isSubmitted = createSignal(false);
  store.isValidating = createSignal(false);
  store.offFormValues = createSignal(config.offFormValues ?? {});

  const form = store as InternalFormStore;
  dispatchBuild(form, config);

  // Initialize field store hierarchy from schema. Array-item objects
  // dispatch their own `buildScope` from inside the walk.
  initializeFieldStore(form, store, config.schema, config.initialInput, []);

  // Wire the ROOT scope's plugin passes over the walked tree, in plugin
  // array order. The raw initial input carries every envelope field's meta
  // half (`{ value, source | entry }`), so there is no side-channel decode.
  dispatchBuildScope(form, form, config.initialInput);

  // Cache the form-level aggregates as computeds LAST, over the fully
  // built tree: the whole-tree walk runs once per invalidation, not once
  // per read (the snapshot adapter reads these on every notification).
  // Short-circuiting is safe under computed semantics for the FIELD walk —
  // but the plugin fold reads every plugin unconditionally (an unran
  // handler contributes no signal reads and would deafen the projection).
  store.aggregates = {
    isTouched: computed(() => getFieldBool(form, "isTouched")),
    isEdited: computed(() => getFieldBool(form, "isEdited")),
    isDirty: computed(() => {
      const fieldsDirty = getFieldBool(form, "isDirty");
      const pluginDirty = pluginsDirty(form);
      return fieldsDirty || pluginDirty;
    }),
    isValid: computed(() => !getFieldBool(form, "validationErrors")),
  };

  return form;
}
