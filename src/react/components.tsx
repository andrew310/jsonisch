// "use no memo" — jsonisch reactivity is signal-based: `useSignals`
// re-subscribes from the reads of EVERY render, so the React Compiler's
// auto-memoization (which skips those reads when `field`/`form` refs are
// stable) silently kills the subscriptions and freezes the UI
// (LOS-567; same class as the PR #334 zustand freeze).
"use no memo";
import type {
  FormHTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";
import type { Path } from "../core/types";
import { handleSubmit, type SubmitHandler } from "../methods/handle-submit";
import type { FieldArrayStore, FieldStore, FormStore } from "./types";
import { useField } from "./use-field";
import { useFieldArray } from "./use-field-array";

/**
 * Props of the headless `Form` component.
 */
export interface FormProps
  extends Omit<
    FormHTMLAttributes<HTMLFormElement>,
    "onSubmit" | "noValidate"
  > {
  /**
   * The form store instance.
   */
  readonly of: FormStore;
  /**
   * The submit handler called with the validated output when validation
   * succeeds.
   */
  readonly onSubmit: SubmitHandler;
  /**
   * The form contents.
   */
  readonly children?: ReactNode;
}

/**
 * Headless form component: a native `<form noValidate>` wired to
 * `handleSubmit` — an invalid submit blocks the handler and focuses the
 * first erroring field. The registry-aware `Form` from `createFormHook`
 * builds on this and adds whole-form auto-rendering.
 *
 * @param props The form component props.
 *
 * @returns A native form element.
 */
export function Form({ of, onSubmit, ...other }: FormProps): ReactElement {
  return (
    <form
      {...other}
      noValidate
      ref={(element) => {
        if (element) {
          of.internal.element = element;
        }
      }}
      onSubmit={handleSubmit(of, onSubmit)}
    />
  );
}

/**
 * Props of the headless `Field` component.
 */
export interface FieldProps {
  /**
   * The form store the field belongs to.
   */
  readonly of: FormStore;
  /**
   * The path to the field.
   */
  readonly path: Path;
  /**
   * The render function receiving the field store.
   */
  readonly children: (field: FieldStore) => ReactNode;
}

/**
 * Headless field component — the escape hatch for custom layouts: takes a
 * form store and a path, and calls the render function with the reactive
 * field store.
 *
 * @param props The field component props.
 *
 * @returns The rendered field UI.
 */
export function Field({ of, path, children }: FieldProps): ReactNode {
  const field = useField(of, path);
  return children(field);
}

/**
 * Props of the headless `FieldArray` component.
 */
export interface FieldArrayProps {
  /**
   * The form store the array field belongs to.
   */
  readonly of: FormStore;
  /**
   * The path to the array field.
   */
  readonly path: Path;
  /**
   * The render function receiving the field array store.
   */
  readonly children: (fieldArray: FieldArrayStore) => ReactNode;
}

/**
 * Headless field array component: calls the render function with the
 * reactive field array store (stable item IDs for React keys).
 *
 * @param props The field array component props.
 *
 * @returns The rendered field array UI.
 */
export function FieldArray({
  of,
  path,
  children,
}: FieldArrayProps): ReactNode {
  const fieldArray = useFieldArray(of, path);
  return children(fieldArray);
}
