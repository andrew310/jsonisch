import { isSemanticEqual } from "../core/dirty";
import { dispatchResetField } from "../core/plugin/driver";
import { getFieldStore } from "../core/field/get-field-store";
import { computeContainerDirty } from "../core/field/set-field-input";
import { setInitialFieldInput } from "../core/field/set-initial-field-input";
import { walkFieldStore } from "../core/field/walk-field-store";
import { validateFormInput } from "../core/form/validate-form-input";
import { batch, untrack } from "../core/framework";
import type { Path } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Configuration for resetting a form or field.
 */
export interface ResetConfig {
  /**
   * The path to the field to reset. Leave undefined to reset the entire
   * form.
   */
  readonly path?: Path | undefined;
  /**
   * The new initial input to reset to. An EXPLICIT `undefined` resets the
   * baseline to the empty input; an OMITTED key keeps the existing
   * baseline — the two are distinguished by key presence.
   */
  readonly initialInput?: unknown;
  /**
   * Whether to keep the current input values. Defaults to `false`.
   */
  readonly keepInput?: boolean | undefined;
  /**
   * Whether to keep the touched state. Defaults to `false`.
   */
  readonly keepTouched?: boolean | undefined;
  /**
   * Whether to keep the edited state. Defaults to `false`.
   */
  readonly keepEdited?: boolean | undefined;
  /**
   * Whether to keep the error messages. Defaults to `false`.
   */
  readonly keepErrors?: boolean | undefined;
  /**
   * Whether to keep the submitted state (form reset only). Defaults to
   * `false`.
   */
  readonly keepSubmitted?: boolean | undefined;
}

/**
 * Resets a specific field or the entire form to its initial state, with
 * fine-grained control over which state to preserve via the `keep*` flags.
 * When `initialInput` is provided it replaces the reset baseline first.
 *
 * @param form The form store to reset.
 * @param config The reset configuration.
 */
export function reset(form: FormRef, config?: ResetConfig): void {
  batch(() => {
    untrack(() => {
      const internalFormStore = internalOf(form);
      const internalFieldStore = config?.path
        ? getFieldStore(internalFormStore, config.path)
        : internalFormStore;

      // Replace the reset baseline when a new initial input is provided —
      // key presence distinguishes explicit `undefined` from omission
      if (config && "initialInput" in config) {
        setInitialFieldInput(
          internalFormStore,
          internalFieldStore,
          config.initialInput,
          { syncInitial: true },
        );
      }

      walkFieldStore(internalFieldStore, (fieldStore) => {
        // Restore each field's own elements — array methods move `elements`
        // between field stores during reorders
        fieldStore.elements = fieldStore.initialElements;

        if (!config?.keepErrors) {
          fieldStore.validationErrors.value = null;
        }
        if (!config?.keepTouched) {
          fieldStore.isTouched.value = false;
        }
        if (!config?.keepEdited) {
          fieldStore.isEdited.value = false;
        }

        // Rebase the dirty baseline onto the reset target
        fieldStore.startInput.value = fieldStore.initialInput.value;
        if (!config?.keepInput) {
          fieldStore.input.value = fieldStore.initialInput.value;
        }

        if (fieldStore.kind === "array") {
          fieldStore.startItems.value = fieldStore.initialItems.value;

          // The items are an internal tracking concept: even with
          // `keepInput`, equal lengths mean no visible difference, so reset
          // them anyway to avoid a phantom-dirty array
          if (
            !config?.keepInput ||
            fieldStore.startItems.value.length ===
              fieldStore.items.value.length
          ) {
            fieldStore.items.value = fieldStore.initialItems.value;
          }
          fieldStore.isDirty.value = computeContainerDirty(fieldStore);
        } else if (fieldStore.kind === "object") {
          fieldStore.isDirty.value = computeContainerDirty(fieldStore);
        } else {
          // Semantic, empty-aware compare — `""` from a nullish baseline
          // stays clean
          fieldStore.isDirty.value = !isSemanticEqual(
            fieldStore.input.value,
            fieldStore.startInput.value,
          );

          // Plugin state: each plugin restores this leaf's slot to its
          // decode-time baseline (mode, entry state, flip timestamp) —
          // from INSIDE the walk, so a scoped reset({path}) stays correct
          dispatchResetField(internalFormStore, fieldStore);

          // Reset file inputs as they cannot be controlled
          for (const element of fieldStore.elements) {
            if (element instanceof HTMLInputElement && element.type === "file") {
              element.value = "";
            }
          }
        }
      });

      // Form-level state resets only apply to a whole-form reset
      if (!config?.path) {
        if (!config?.keepSubmitted) {
          internalFormStore.isSubmitted.value = false;
        }
        if (internalFormStore.validate === "initial") {
          validateFormInput(internalFormStore);
        }
      }
    });
  });
}
