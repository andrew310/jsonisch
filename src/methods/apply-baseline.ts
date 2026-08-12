import { decodeRecord } from "../core/codec/decode-record";
import { rebaseFieldBaseline } from "../core/field/rebase-field-baseline";
import { setInitialFieldInput } from "../core/field/set-initial-field-input";
import { validateFormInput } from "../core/form/validate-form-input";
import { batch, untrack } from "../core/framework";
import { dispatchRebase } from "../core/plugin/driver";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Configuration for `applyBaseline`.
 */
export interface ApplyBaselineConfig {
  /**
   * Fresh off-form values (canonical rows, the read-only eval scope) to
   * adopt in the same batch as the baseline, so formula fields recompute
   * once against a consistent snapshot. Omit to keep the current values.
   */
  readonly offFormValues?: Record<string, unknown> | undefined;
}

/**
 * Rebases a live form on a fresh server-loaded record — after a save or a
 * revalidate, the store adopts the record as its new baseline instead of
 * being torn down and rebuilt: the record decodes through the `x-column`
 * codec (envelope fields keep their kind-discriminated shape for
 * the plugin rebase), clean fields
 * take the new server value, dirty fields keep the user's in-flight edit
 * re-diffed against the new baseline (an edit equal to the fresh server
 * value becomes clean), and a later `reset()` returns to the NEW baseline.
 * Array membership follows the same rule: unchanged membership adopts the
 * server rows — by `id` when the item schema has usable ids, otherwise
 * positionally — and surviving rows keep their identity. Unmatched clean
 * locals drop; unmatched dirty locals append after the server prefix
 * (field-level dirty still enables Save). Locally changed membership wins,
 * with rows still rebasing content by server `id` where ids exist.
 *
 * It is NOT conflict resolution — two people editing the same field stays
 * last-write-wins. A nullish record is a no-op (nothing to rebase on).
 *
 * For flat-JSONB surfaces without column routing, pass the bag as
 * `{ data: bag }` (the `decodeRecord` convention).
 *
 * @param form The form store to rebase.
 * @param record The fresh server record (`{ …columns, data? }`).
 * @param config Rebase options (e.g. fresh off-form values).
 */
export function applyBaseline(
  form: FormRef,
  record: Record<string, unknown> | null | undefined,
  config?: ApplyBaselineConfig,
): void {
  const internalFormStore = internalOf(form);
  const decoded = decodeRecord(internalFormStore.schema, record, {
    envelopes: internalFormStore.pluginDriver.envelopes,
  });
  if (decoded === undefined) return;

  batch(() => {
    untrack(() => {
      // Reset-target half first, then the live rebase, then the ROOT
      // plugin rebase — each plugin re-decodes its half from the same raw
      // decoded record (envelope fields carry their meta inline). Row
      // plugin state rebases inside `rebaseFieldBaseline`, from each fresh
      // row object.
      setInitialFieldInput(internalFormStore, internalFormStore, decoded);
      rebaseFieldBaseline(internalFormStore, internalFormStore, decoded);
      dispatchRebase(internalFormStore, internalFormStore, decoded);

      if (config?.offFormValues) {
        internalFormStore.offFormValues.value = config.offFormValues;
      }

      if (internalFormStore.validate === "initial") {
        validateFormInput(internalFormStore);
      }
    });
  });
}
