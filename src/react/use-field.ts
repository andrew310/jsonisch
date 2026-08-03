import { useEffect, useMemo } from "react";
import { getFieldBool } from "../core/field/get-field-bool";
import { getFieldInput } from "../core/field/get-field-input";
import { getFieldStore } from "../core/field/get-field-store";
import { setFieldBool } from "../core/field/set-field-bool";
import { setFieldInput } from "../core/field/set-field-input";
import { validateIfRequired } from "../core/form/validate-if-required";
import type { Path } from "../core/types";
import type { FieldStore, FormStore } from "./types";
import { useSignals } from "./use-signals";

/**
 * Creates a reactive field store for the field at the given path. Widgets
 * are controlled components: render `field.input`, call
 * `field.onChange(value)`, and spread `field.props` onto the DOM element so
 * focus/blur validation modes and focus-on-error work.
 *
 * @param form The form store the field belongs to.
 * @param path The path to the field.
 *
 * @returns The field store with reactive properties.
 */
export function useField(form: FormStore, path: Path): FieldStore {
  useSignals();

  const internalFormStore = form.internal;
  const internalFieldStore = getFieldStore(internalFormStore, path);

  // On unmount, drop elements that left the DOM. `initialElements` is kept
  // in sync while the store still owns its elements (same reference) and
  // filtered separately otherwise, so the detached element of a removed
  // array item does not survive in the reset baseline.
  useEffect(() => {
    return () => {
      const elements = internalFieldStore.elements.filter(
        (element) => element.isConnected,
      );
      if (
        internalFieldStore.elements === internalFieldStore.initialElements
      ) {
        internalFieldStore.initialElements = elements;
      } else {
        internalFieldStore.initialElements =
          internalFieldStore.initialElements.filter(
            (element) => element.isConnected,
          );
      }
      internalFieldStore.elements = elements;
    };
  }, [internalFieldStore]);

  return useMemo(
    () => ({
      path,
      name: internalFieldStore.name,
      schema: internalFieldStore.schema,
      control: internalFieldStore.control,
      get input() {
        return getFieldInput(internalFieldStore);
      },
      get errors() {
        return internalFieldStore.errors.value;
      },
      get isTouched() {
        return getFieldBool(internalFieldStore, "isTouched");
      },
      get isEdited() {
        return getFieldBool(internalFieldStore, "isEdited");
      },
      get isDirty() {
        return getFieldBool(internalFieldStore, "isDirty");
      },
      get isValid() {
        return !getFieldBool(internalFieldStore, "errors");
      },
      onChange(value: unknown) {
        setFieldInput(internalFormStore, path, value);
        validateIfRequired(internalFormStore, internalFieldStore, "input");
        validateIfRequired(internalFormStore, internalFieldStore, "change");
      },
      props: {
        name: internalFieldStore.name,
        autoFocus: !!internalFieldStore.errors.value,
        ref(element) {
          // An array reorder transfers registered elements between field
          // stores, so the element may already be present when React
          // re-registers it against the destination store
          if (element && !internalFieldStore.elements.includes(element)) {
            internalFieldStore.elements.push(element);
          }
        },
        onFocus() {
          setFieldBool(internalFieldStore, "isTouched", true);
          validateIfRequired(internalFormStore, internalFieldStore, "touch");
        },
        onBlur() {
          validateIfRequired(internalFormStore, internalFieldStore, "blur");
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [internalFormStore, internalFieldStore],
  );
}
