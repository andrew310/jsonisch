import type { ComponentType } from "react";
import type { ControlKind } from "../core/control";
import type {
  DerivationMode,
  DerivedState,
  FieldElement,
  FieldErrors,
  FormConfig,
  FormValidator,
  InternalFormStore,
  JsonSchema,
  Path,
} from "../core/types";
import type { EntryMode } from "../plugins/companions/types";

/**
 * The public form store returned by `useForm`/`useAppForm`: an immutable
 * snapshot whose identity changes when any observed form-level value
 * changes — reactivity rides on the object, not on property reads, so it
 * composes with React Compiler memoization. The internal store is
 * reachable for the methods layer — every method accepts this wrapper
 * directly.
 */
export interface FormStore {
  /**
   * The internal form store (the methods layer unwraps it).
   */
  readonly internal: InternalFormStore;
  /**
   * Whether the form is currently submitting.
   */
  readonly isSubmitting: boolean;
  /**
   * Whether the form has been submitted.
   */
  readonly isSubmitted: boolean;
  /**
   * Whether the form is currently validating.
   */
  readonly isValidating: boolean;
  /**
   * Whether any field in the form has been touched.
   */
  readonly isTouched: boolean;
  /**
   * Whether any field in the form has been edited.
   */
  readonly isEdited: boolean;
  /**
   * Whether any field in the form differs from its start input.
   */
  readonly isDirty: boolean;
  /**
   * Whether no field in the form has errors.
   */
  readonly isValid: boolean;
  /**
   * The form-level (root) errors. Use `getDeepErrors` for all field errors.
   */
  readonly errors: FieldErrors;
}

/**
 * The props a field store provides for binding a DOM element.
 */
export interface FieldElementProps {
  /**
   * The name attribute of the field element.
   */
  readonly name: string;
  /**
   * Whether to autofocus the element (set while the field has errors).
   */
  readonly autoFocus: boolean;
  /**
   * The ref callback registering the element on the field store.
   */
  readonly ref: (element: FieldElement | null) => void;
  /**
   * The focus handler (marks the field touched). Takes no arguments so it
   * assigns to any element's focus handler type.
   */
  readonly onFocus: () => void;
  /**
   * The blur handler (triggers blur-mode validation). Takes no arguments so
   * it assigns to any element's blur handler type.
   */
  readonly onBlur: () => void;
}

/**
 * The public field store returned by `useField`: an immutable snapshot —
 * a new object identity whenever any observed value changes, stable
 * otherwise. Widgets are plain controlled components that render `input`
 * and call `onChange` with the new value; no signal hook, no directive.
 */
export interface FieldStore {
  /**
   * The path to the field within the form.
   */
  readonly path: Path;
  /**
   * The property name of the field (last path segment).
   */
  readonly name: string;
  /**
   * The JSON-Schema node of the field (title, enum options, formats, …).
   */
  readonly schema: JsonSchema;
  /**
   * The widget kind the field renders as (resolved at walk time).
   */
  readonly control: ControlKind;
  /**
   * The current input value of the field.
   */
  readonly input: unknown;
  /**
   * The current error messages of the field.
   */
  readonly errors: FieldErrors;
  /**
   * Whether the field (or a descendant) has been touched.
   */
  readonly isTouched: boolean;
  /**
   * Whether the field (or a descendant) has been edited.
   */
  readonly isEdited: boolean;
  /**
   * Whether the field (or a descendant) differs from its start input.
   */
  readonly isDirty: boolean;
  /**
   * Whether the field and its descendants have no errors.
   */
  readonly isValid: boolean;
  /**
   * Whether the field currently renders: `false` for a `hidden` control or
   * while a conditional-visibility rule (`visibleWhen`) is unsatisfied.
   * Registry dispatch skips invisible fields; headless layouts decide
   * themselves. A hidden field keeps its state, dirtiness, and place in
   * the payload.
   */
  readonly visible: boolean;
  /**
   * Sets the field input (controlled-component change handler).
   */
  readonly onChange: (value: unknown) => void;
  /**
   * The props to spread onto the field element.
   */
  readonly props: FieldElementProps;
  /**
   * The mode-aware derived output of a formula/estimate field (what the
   * field displays; an estimate pin holds the input). `undefined` on
   * non-derived fields or without a calc engine.
   */
  readonly derived: DerivedState | undefined;
  /**
   * The always-computed formula result of a formula/estimate field,
   * ignoring the estimate pin — the nudge's candidate value.
   */
  readonly formulaValue: DerivedState | undefined;
  /**
   * The estimate/formula mode of an estimate field, `undefined` otherwise.
   */
  readonly mode: DerivationMode | undefined;
  /**
   * Flips an estimate field's mode (see the `setMode` method — seeds the
   * estimate from the last formula result, stamps the companion).
   */
  readonly setMode: (mode: DerivationMode) => void;
  /**
   * The entry mode of an amount-or-percent field, `undefined` otherwise.
   */
  readonly entryMode: EntryMode | undefined;
  /**
   * Sets an amount-or-percent field's entry mode (dirties the companion).
   */
  readonly setEntryMode: (mode: EntryMode) => void;
  /**
   * The percent basis of an amount-or-percent field (a loan field key).
   */
  readonly percentBasis: string | undefined;
  /**
   * Sets an amount-or-percent field's percent basis (dirties the
   * companion).
   */
  readonly setPercentBasis: (percentBasis: string) => void;
}

/**
 * The public field array store returned by `useFieldArray`.
 */
export interface FieldArrayStore {
  /**
   * The path to the array field within the form.
   */
  readonly path: Path;
  /**
   * The stable item IDs, one per row — use them as React keys so state
   * follows its row across reorders.
   */
  readonly items: string[];
  /**
   * The current error messages of the array field itself.
   */
  readonly errors: FieldErrors;
  /**
   * Whether the array (or a descendant) has been touched.
   */
  readonly isTouched: boolean;
  /**
   * Whether the array (or a descendant) has been edited.
   */
  readonly isEdited: boolean;
  /**
   * Whether the array (or a descendant) differs from its start input.
   */
  readonly isDirty: boolean;
  /**
   * Whether the array and its descendants have no errors.
   */
  readonly isValid: boolean;
}

/**
 * The props every registry widget receives.
 */
export interface WidgetProps {
  /**
   * The field store the widget renders.
   */
  readonly field: FieldStore;
  /**
   * The form store the field belongs to.
   */
  readonly form: FormStore;
}

/**
 * The configuration of `createFormHook`: the registry mapping widget kinds
 * to components, plus the injected validator compiler.
 */
export interface FormHookConfig {
  /**
   * The widget registry, keyed by `ControlKind`. A kind without an entry
   * renders the `fallback`.
   */
  readonly widgets: Partial<Record<ControlKind, ComponentType<WidgetProps>>>;
  /**
   * The widget rendered for a kind without a registry entry. Without one, a
   * built-in placeholder names the unsupported kind visibly.
   */
  readonly fallback?: ComponentType<WidgetProps> | undefined;
  /**
   * Compiles the injected validator for a schema, called ONCE per form
   * (memoized by `useAppForm`). Omit for forms without enforcement.
   */
  readonly validate?: ((schema: JsonSchema) => FormValidator) | undefined;
}

/**
 * The configuration of `useAppForm`: the store config minus the validator,
 * which the hook compiles itself via the registry's `validate`.
 */
export type UseAppFormConfig = Omit<FormConfig, "validator">;
