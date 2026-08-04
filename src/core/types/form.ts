import type { Signal } from "../signal";
import type { CalcEngine } from "./derivation";
import type { InternalObjectStore } from "./field";
import type { JsonSchema } from "./schema";

/**
 * When validation runs. `validate` is the mode that arms validation the
 * first time; `revalidate` takes over once the form is in the "already
 * validated" state (submitted, or the triggering subtree has errors) — the
 * formisch two-mode model: validate on submit, revalidate on input.
 */
export type ValidationMode =
  | "initial"
  | "touch"
  | "input"
  | "change"
  | "blur"
  | "submit";

/**
 * One validation issue in the injected validator's output. Deliberately
 * AJV-shaped (`ErrorObject` subset) so an app can pass a compiled AJV
 * validate function's `errors` through unchanged — jsonisch itself never
 * depends on AJV.
 */
export interface ValidationIssue {
  /**
   * JSON-Pointer to the failing value (`""` for the root). Routed to the
   * field store's `errors` signal; an unroutable pointer lands on the
   * nearest addressable ancestor.
   */
  readonly instancePath?: string | undefined;
  /**
   * The human-readable message. Falls back to a generic message when absent.
   */
  readonly message?: string | undefined;
  /**
   * The failed JSON-Schema keyword. `required` issues point at the parent
   * object; routing appends `params.missingProperty` so the error lands on
   * the missing field itself.
   */
  readonly keyword?: string | undefined;
  /**
   * Keyword-specific parameters (e.g. `missingProperty` for `required`).
   */
  readonly params?: Record<string, unknown> | undefined;
}

/**
 * The injected validator: compiled ONCE per schema by the caller, returns
 * the issues for an input (`null`/`undefined`/empty for a valid input).
 * Synchronous by design — AJV is sync.
 */
export type FormValidator = (
  input: unknown,
) => readonly ValidationIssue[] | null | undefined;

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
  /**
   * The injected validator, compiled once per schema by the caller. Without
   * one the form always validates successfully (enforcement rollout is
   * per-form opt-in).
   */
  readonly validator?: FormValidator | undefined;
  /**
   * The injected calc engine (`@rwa/formulas` in the app). Enables the
   * derivation graph: every root-level `x-formula` is parsed once at store
   * init and its field becomes a computed signal. Without an engine no
   * derivation is built (formula fields still walk as value leaves).
   */
  readonly calcEngine?: CalcEngine | undefined;
  /**
   * The validation mode of the form. Defaults to `"submit"`.
   */
  readonly validate?: ValidationMode | undefined;
  /**
   * The revalidation mode of the form. Defaults to `"input"`.
   */
  readonly revalidate?: Exclude<ValidationMode, "initial"> | undefined;
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
   * The injected validator, or `undefined` for a form without enforcement.
   */
  validator: FormValidator | undefined;
  /**
   * The validation mode of the form.
   */
  validate: ValidationMode;
  /**
   * The revalidation mode of the form.
   */
  revalidate: Exclude<ValidationMode, "initial">;
  /**
   * The number of active validators (kept as a counter so a future async
   * validator cannot flicker `isValidating`).
   */
  validators: number;
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
  // TODO(LOS-539): read-only render mode.
}
