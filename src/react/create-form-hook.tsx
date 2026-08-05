import { useMemo, type ReactElement, type ReactNode } from "react";
import type { Path } from "../core/types";
import {
  Field as HeadlessField,
  Form as HeadlessForm,
  type FormProps,
} from "./components";
import type {
  FieldStore,
  FormHookConfig,
  FormStore,
  UseAppFormConfig,
  WidgetProps,
} from "./types";
import { useField } from "./use-field";
import { useForm } from "./use-form";

/**
 * The built-in fallback for a widget kind without a registry entry: a
 * visible, explicit placeholder — silently dropping a field would make a
 * schema misconfiguration invisible.
 */
function UnsupportedWidget({ field }: WidgetProps): ReactElement {
  return (
    <p data-slot="jsonisch-unsupported" role="note">
      Unsupported field kind &ldquo;{field.control}&rdquo; ({field.name})
    </p>
  );
}

/**
 * Props of the registry-aware `Field` component returned by
 * `createFormHook`.
 */
export interface AppFieldProps {
  /**
   * The form store the field belongs to.
   */
  readonly of: FormStore;
  /**
   * The path to the field.
   */
  readonly path: Path;
  /**
   * Optional render function for a custom layout (headless mode). Without
   * it the field renders its registry widget.
   */
  readonly children?: ((field: FieldStore) => ReactNode) | undefined;
}

/**
 * The bound form API returned by `createFormHook`.
 */
export interface FormHook {
  /**
   * Creates a form store, compiling the injected validator once for the
   * form's schema.
   */
  readonly useAppForm: (config: UseAppFormConfig) => FormStore;
  /**
   * The form component. Without children it renders the WHOLE form from
   * the schema via the widget registry — no hand-written field components.
   */
  readonly Form: (props: FormProps) => ReactElement;
  /**
   * The field component: registry-dispatched without children, headless
   * with a render function.
   */
  readonly Field: (props: AppFieldProps) => ReactNode;
  /**
   * The auto-rendered field list (every non-hidden root field through its
   * registry widget). `Form` renders it when given no children; use it
   * directly to compose auto fields with custom chrome (e.g. a footer).
   */
  readonly Fields: (props: { readonly of: FormStore }) => ReactElement;
}

/**
 * Creates the app's form API around a widget registry (the TanStack
 * `createFormHook` borrow): widgets are registered ONCE at module level,
 * and every form derives its fields from the schema through them.
 *
 * @param config The registry and injected validator compiler.
 *
 * @returns The bound `useAppForm`, `Form` and `Field`.
 */
export function createFormHook(config: FormHookConfig): FormHook {
  const Fallback = config.fallback ?? UnsupportedWidget;

  function useAppForm(formConfig: UseAppFormConfig): FormStore {
    // Compile the validator once per form — the schema is stable for the
    // form's lifetime by the useForm contract
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const validator = useMemo(
      () => config.validate?.(formConfig.schema),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );
    return useForm({ ...formConfig, validator });
  }

  function AppField({ of, path, children }: AppFieldProps): ReactNode {
    if (children) {
      return (
        <HeadlessField of={of} path={path}>
          {children}
        </HeadlessField>
      );
    }
    return <RegistryField of={of} path={path} />;
  }

  function RegistryField({
    of,
    path,
  }: Omit<AppFieldProps, "children">): ReactNode {
    const field = useField(of, path);
    // Conditional WHEN: an unsatisfied rule skips rendering only — the
    // field's state, dirtiness, and payload spot survive the toggle
    if (!field.visible) return null;
    const Widget = config.widgets[field.control] ?? Fallback;
    return <Widget field={field} form={of} />;
  }

  function AutoFields({ of }: { readonly of: FormStore }): ReactElement {
    // The root children were stamped by the walk in schema property order;
    // 'hidden' kinds exist in state and payload but never render
    const root = of.internal;
    return (
      <>
        {Object.entries(root.children).map(([key, child]) =>
          child.control === "hidden" ? null : (
            <AppField key={key} of={of} path={[key]} />
          ),
        )}
      </>
    );
  }

  function AppForm({ of, onSubmit, children, ...other }: FormProps): ReactElement {
    return (
      <HeadlessForm of={of} onSubmit={onSubmit} {...other}>
        {children ?? <AutoFields of={of} />}
      </HeadlessForm>
    );
  }

  return { useAppForm, Form: AppForm, Field: AppField, Fields: AutoFields };
}
