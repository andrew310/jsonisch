// The bridge from the signal graph to React — `useField` assembles the
// `FieldStore` snapshot a widget renders, in three parts:
//
//   1. TRACKED HALF (`readFieldSnapshot` via `useSignalSnapshot`): every
//      reactive value — core flags + plugin `fieldSnapshot` contributions —
//      read in ONE closure the library invokes. Reads inlined into a
//      component body instead would be memoised away by React Compiler
//      (the LOS-567 freeze); reads inside a library-owned hook cannot be.
//   2. STABLE HALF (`useMemo`): `onChange` + DOM plumbing, identity-fixed
//      for the field's lifetime so memoised children never re-render on
//      handler churn.
//   3. ASSEMBLY (`useMemo` on the tracked half): one immutable object whose
//      identity changes exactly when an observed value did — compiler memo
//      caches keyed on `field` miss precisely when they should.
//
// The adapter knows no plugin's vocabulary: what a field exposes beyond the
// core members is the plugins' decision (LOS-604).
import { useEffect, useMemo } from "react";
import { getFieldBool } from "../core/field/get-field-bool";
import { getFieldInput } from "../core/field/get-field-input";
import { getFieldStore } from "../core/field/get-field-store";
import { setFieldBool } from "../core/field/set-field-bool";
import { setFieldInput } from "../core/field/set-field-input";
import { validateIfRequired } from "../core/form/validate-if-required";
import { dispatchFieldSnapshot } from "../core/plugin/driver";
import type {
  FieldElement,
  InternalFieldStore,
  InternalFormStore,
  Path,
} from "../core/types";
import type { FieldStore, FieldStoreSlots, FormStore } from "./types";
import { useSignalSnapshot } from "./use-signal-snapshot";

/**
 * The snapshot member names owned by the adapter itself — no plugin's
 * `fieldSnapshot` may claim one (`dispatchFieldSnapshot` throws). Covers
 * the public `FieldStore` members plus the two internal tracked keys
 * (`hasValidationErrors`/`autoFocus`) that feed them.
 */
const RESERVED_SNAPSHOT_KEYS: ReadonlySet<string> = new Set([
  "path",
  "name",
  "schema",
  "control",
  "input",
  "errors",
  "isTouched",
  "isEdited",
  "isDirty",
  "isValid",
  "visible",
  "onChange",
  "props",
  "hasValidationErrors",
  "autoFocus",
]);

/**
 * Everything reactive about a field, read in one tracked pass owned by
 * `useSignalSnapshot` (never inline in a component body, so React Compiler
 * memoization cannot elide the reads). Plugin members merge in FLAT — at
 * the snapshot's top level, never nested under a sub-object — so the
 * one-extra-level value compare of `snapshotEqual` still reaches inside a
 * recomputed result object (a `DerivedState`) and gates the re-render.
 */
function readFieldSnapshot(
  internalFormStore: InternalFormStore,
  internalFieldStore: InternalFieldStore,
  path: Path,
) {
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
    ...(dispatchFieldSnapshot(
      internalFormStore,
      internalFieldStore,
      path,
      RESERVED_SNAPSHOT_KEYS,
    ) as Partial<FieldStoreSlots>),
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

  // `path` is captured by the tracked compute under the store-keyed deps —
  // safe because field stores are position-fixed: a store's path content
  // never changes for its lifetime (array ops move values, not stores).
  const reactive = useSignalSnapshot(
    () => readFieldSnapshot(internalFormStore, internalFieldStore, path),
    [internalFormStore, internalFieldStore],
  );

  // Callbacks and DOM plumbing: identity-stable for the field's lifetime.
  // `path` is captured — safe for the same position-fixed reason as above.
  const stable = useMemo(
    () => ({
      onChange(value: unknown) {
        setFieldInput(internalFormStore, path, value);
        validateIfRequired(internalFormStore, internalFieldStore, "input");
        validateIfRequired(internalFormStore, internalFieldStore, "change");
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
  return useMemo(() => {
    // Plugin-contributed members ride `rest`; the runtime collision guard
    // in `dispatchFieldSnapshot` is what makes the spread + cast sound.
    const { hasValidationErrors, autoFocus, ...rest } = reactive;
    return {
      path,
      name: internalFieldStore.name,
      schema: internalFieldStore.schema,
      control: internalFieldStore.control,
      ...rest,
      isValid: !hasValidationErrors,
      onChange: stable.onChange,
      props: { ...stable.props, autoFocus },
    } as FieldStore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactive, stable]);
}
