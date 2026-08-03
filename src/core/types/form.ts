import type { Signal } from "../signal";
import type { InternalObjectStore } from "./field";
import type { JsonSchema } from "./schema";

/**
 * Configuration for creating a form store.
 */
export interface FormConfig {
  /**
   * The JSON-Schema the form is derived from (runtime DB data).
   */
  readonly schema: JsonSchema;
  /**
   * The initial input in the nested server-record shape (no pre-flattening).
   * Keys not declared in the schema never enter form state (the schema is
   * the allow-list).
   */
  readonly initialInput?: unknown;
  /**
   * Read-only eval scope for formula resolution (off-form values). Becomes a
   * settable signal on the store; `applyBaseline` updates it.
   */
  readonly offFormValues?: Record<string, unknown>;
  /**
   * The empty input a required field without an initial input starts at,
   * keyed by JSON-Schema type. Merged over the default (`{ string: "" }` —
   * required strings start as `""`, every other type as `undefined`).
   */
  readonly emptyInput?: Record<string, unknown>;
  // TODO(LOS-539): validation/revalidation mode config once the AJV rollout
  // policy (per-form opt-in) is wired.
}

/**
 * PLACEHOLDER — injected environment for a form store
 * (`createFormStore(config, deps)`). Shapes are not settled.
 */
export interface FormDeps {
  // TODO(LOS-539): injected AJV validator (compiled once per schema,
  // per-field issue routing into the `errors` signals).
  // TODO(LOS-539): injected calc engine ({ evaluate, extractDependencies })
  // from @rwa/formulas for the derivation graph.
}

/**
 * The internal form store: the root object node plus form-level state.
 */
export interface InternalFormStore extends InternalObjectStore {
  /**
   * The resolved empty-input config (defaults merged with the form config),
   * read by the walk when defaulting required fields without initial input.
   */
  emptyInput: Record<string, unknown>;
  /**
   * The form element (react adapter only; unset on the server).
   */
  element?: HTMLFormElement | undefined;
  /**
   * Off-form values used to fill `undefined` in formula scope resolution.
   * Settable: `applyBaseline` updates it and dependents re-resolve.
   */
  offFormValues: Signal<Record<string, unknown>>;
  /**
   * The submitting state of the form.
   */
  isSubmitting: Signal<boolean>;
  /**
   * The submitted state of the form.
   */
  isSubmitted: Signal<boolean>;
  /**
   * The validating state of the form.
   */
  isValidating: Signal<boolean>;
  // TODO(LOS-539): parsed formula dep graph (topo-sorted computed signals),
  // injected validator handle, read-only render mode.
}
