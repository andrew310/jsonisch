import type { PluginDriver } from "../plugin/driver";
import type { PluginKey } from "../plugin/key";
import type { PluginsInput } from "../plugin/types";
import type { ReadonlySignal, Signal } from "../signal";
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
   * The identifier the host's stored formulas use for the root record
   * (`record` by default). Why it exists: a row's eval scope is sealed to
   * its own columns, so a per-row calc that needs a root value — an
   * asset's share of `loan[totalLoanAmount]` — can only reach the root
   * through this one name. Reserved in row scope (it wins over a row
   * column of the same name); hosts whose schemas already say `loan[…]`
   * pass `"loan"`.
   */
  readonly rootRecordAlias?: string | undefined;
  /**
   * The registered plugins, run in array order within each hook. Falsy
   * entries and one level of nesting are accepted
   * (`plugins: [envelopes(), engine && derivation(engine)]`). Everything
   * computed on top of the base pipeline — envelope meta state,
   * derivation, visibility — registers here; a form without plugins is a
   * plain schema-walked value store.
   */
  readonly plugins?: PluginsInput | undefined;
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
   * The validation mode of the form. Defaults to `"submit"`.
   */
  readonly validate?: ValidationMode | undefined;
  /**
   * The revalidation mode of the form. Defaults to `"input"`.
   */
  readonly revalidate?: Exclude<ValidationMode, "initial"> | undefined;
}

/**
 * The `computed`-cached form-level aggregates. Each one wraps a whole-tree
 * `getFieldBool` walk (plus the meta channel for `isDirty`) so the walk
 * runs once per invalidation instead of once per read — under the react
 * adapter's snapshot model `useForm` reads these on every notification,
 * which without caching would mean four full-tree walks per keystroke.
 */
export interface FormAggregates {
  /**
   * Whether any field in the form has been touched.
   */
  readonly isTouched: ReadonlySignal<boolean>;
  /**
   * Whether any field in the form has been edited.
   */
  readonly isEdited: ReadonlySignal<boolean>;
  /**
   * Whether any field differs from its start input, OR any root-level
   * field's meta channel is dirty (a mode flip with an unchanged value
   * still produces a payload, so Save must enable).
   */
  readonly isDirty: ReadonlySignal<boolean>;
  /**
   * Whether no field in the form has validation errors. Calc errors are
   * excluded — only user-fixable validation gates validity.
   */
  readonly isValid: ReadonlySignal<boolean>;
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
   * The resolved root-record alias (config value or the default) —
   * the one home both the shelf alias writer and the scope resolvers read.
   */
  rootRecordAlias: string;
  /**
   * The injected validator, or `undefined` for a form without enforcement.
   */
  validator: FormValidator | undefined;
  /**
   * The resolved plugin runtime: flat plugin list, per-hook implementer
   * lists, envelope wire contracts by control kind. Set BEFORE the walk so
   * the walk can dispatch scope hooks for the rows it creates.
   */
  pluginDriver: PluginDriver;
  /**
   * Each plugin's state container, keyed by its `PluginKey` identity
   * (created by the plugin's `build`). Read through the exported keys
   * (`envelopesKey.get(form, store)`), never directly.
   */
  pluginState: Map<PluginKey<unknown>, unknown>;
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
  /**
   * The cached form-level aggregates (see `FormAggregates`).
   */
  aggregates: FormAggregates;
  // TODO(LOS-539): read-only render mode.
}
