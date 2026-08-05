import { useEffect, useMemo } from "react";
import { getFieldBool } from "../core/field/get-field-bool";
import { getFieldInput } from "../core/field/get-field-input";
import { getFieldStore } from "../core/field/get-field-store";
import { setFieldBool } from "../core/field/set-field-bool";
import { setFieldInput } from "../core/field/set-field-input";
import { validateIfRequired } from "../core/form/validate-if-required";
import type {
  DerivationMode,
  EntryMode,
  FieldElement,
  InternalFieldStore,
  Path,
} from "../core/types";
import { setEntryMode, setPercentBasis } from "../methods/set-entry";
import { setMode } from "../methods/set-mode";
import type { FieldStore, FormStore } from "./types";
import { useSignalSnapshot } from "./use-signal-snapshot";

/**
 * Everything reactive about a field, read in one tracked pass owned by
 * `useSignalSnapshot` (never inline in a component body, so React Compiler
 * memoization cannot elide the reads).
 */
function readFieldSnapshot(internalFieldStore: InternalFieldStore) {
  const hybridMeta =
    internalFieldStore.kind === "value" &&
    internalFieldStore.meta?.family === "hybrid"
      ? internalFieldStore.meta
      : undefined;
  return {
    input: getFieldInput(internalFieldStore),
    errors: internalFieldStore.errors.value,
    isTouched: getFieldBool(internalFieldStore, "isTouched"),
    isEdited: getFieldBool(internalFieldStore, "isEdited"),
    isDirty: getFieldBool(internalFieldStore, "isDirty"),
    // Calc errors don't invalidate the field — the user can't fix them
    hasValidationErrors: getFieldBool(internalFieldStore, "validationErrors"),
    visible:
      internalFieldStore.control === "hidden"
        ? false
        : (internalFieldStore.visible?.value ?? true),
    // Focus-on-error is for errors the user can fix — never a calc error
    autoFocus: !!internalFieldStore.validationErrors.value,
    derived:
      internalFieldStore.kind === "value"
        ? internalFieldStore.derived?.value
        : undefined,
    formulaValue:
      internalFieldStore.kind === "value"
        ? internalFieldStore.formulaValue?.value
        : undefined,
    mode:
      internalFieldStore.kind === "value"
        ? internalFieldStore.mode?.value
        : undefined,
    entryMode: hybridMeta?.entryMode.value,
    percentBasis: hybridMeta?.percentBasis.value,
  };
}

/**
 * Creates a reactive field store for the field at the given path. Widgets
 * are controlled components: render `field.input`, call
 * `field.onChange(value)`, and spread `field.props` onto the DOM element so
 * focus/blur validation modes and focus-on-error work.
 *
 * The returned store is an immutable SNAPSHOT: its identity changes when
 * any observed value changes and is stable otherwise, so it composes with
 * React Compiler memoization instead of fighting it (the LOS-567/LOS-602
 * rewrite). Callbacks and DOM plumbing keep a stable identity for the
 * field's lifetime.
 *
 * @param form The form store the field belongs to.
 * @param path The path to the field.
 *
 * @returns The field store snapshot.
 */
export function useField(form: FormStore, path: Path): FieldStore {
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

  const reactive = useSignalSnapshot(
    () => readFieldSnapshot(internalFieldStore),
    [internalFieldStore],
  );

  // Callbacks and DOM plumbing: identity-stable for the field's lifetime.
  // `path` and `form` are captured — safe because every consumer only
  // reaches the stable `form.internal` / an equal-content path through them.
  const stable = useMemo(
    () => ({
      onChange(value: unknown) {
        setFieldInput(internalFormStore, path, value);
        validateIfRequired(internalFormStore, internalFieldStore, "input");
        validateIfRequired(internalFormStore, internalFieldStore, "change");
      },
      setMode(mode: DerivationMode) {
        setMode(form, path, mode);
      },
      setEntryMode(mode: EntryMode) {
        setEntryMode(form, path, mode);
      },
      setPercentBasis(percentBasis: string) {
        setPercentBasis(form, path, percentBasis);
      },
      props: {
        name: internalFieldStore.name,
        ref(element: FieldElement | null) {
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

  // New identity whenever anything observed changed — this is what makes
  // React Compiler memoization correct instead of fatal.
  return useMemo(
    () => ({
      path,
      name: internalFieldStore.name,
      schema: internalFieldStore.schema,
      control: internalFieldStore.control,
      input: reactive.input,
      errors: reactive.errors,
      isTouched: reactive.isTouched,
      isEdited: reactive.isEdited,
      isDirty: reactive.isDirty,
      isValid: !reactive.hasValidationErrors,
      visible: reactive.visible,
      derived: reactive.derived,
      formulaValue: reactive.formulaValue,
      mode: reactive.mode,
      entryMode: reactive.entryMode,
      percentBasis: reactive.percentBasis,
      onChange: stable.onChange,
      setMode: stable.setMode,
      setEntryMode: stable.setEntryMode,
      setPercentBasis: stable.setPercentBasis,
      props: { ...stable.props, autoFocus: reactive.autoFocus },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reactive, stable],
  );
}
