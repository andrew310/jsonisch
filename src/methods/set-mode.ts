import { isEmptyish } from "../core/dirty";
import { getFieldStore } from "../core/field/get-field-store";
import { batch, untrack } from "../core/framework";
import type { DerivationMode, Path } from "../core/types";
import { writeEnvelope } from "../plugins/envelopes/envelope";
import { envelopesKey } from "../plugins/envelopes/key";
import { derivationKey } from "../plugins/derivation/key";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Options for `setMode`.
 */
export interface SetModeOptions {
  /**
   * The flip timestamp (ISO-8601) stamped into the meta half's
   * `lastFlippedAt`. Defaults to the current time; inject for
   * deterministic tests.
   */
  readonly now?: string | undefined;
}

/**
 * Flips an estimate field between its two modes — the ONLY supported mode
 * writer (a raw `mode` signal write skips value seeding and the flip
 * timestamp):
 *
 * - `estimate` → `formula`: the current input is preserved as the meta
 *   half's `manualValue` and the field computes again. The derived value
 *   is NOT written into the input — derived values are outputs; the
 *   server recompute pass is their author.
 * - `formula` → `estimate`: the manual value is seeded from the last
 *   formula result (estimate-first chronology: when you stop trusting the
 *   formula you start from its current value and adjust), which marks the
 *   value dirty like any user edit.
 *
 * Either flip dirties the meta half (`lastFlippedAt` stamped), so a flip
 * with no other edit still produces a payload.
 *
 * Works at any depth: an estimate field inside an array row has its own
 * envelope slot, built from the row's envelope. The throw is reserved
 * for a field that genuinely has none — a non-estimate control, or a form
 * without the envelopes plugin.
 *
 * @param form The form store containing the field.
 * @param path The path to the estimate field.
 * @param mode The target mode (a no-op when already current).
 * @param options Flip options (e.g. an injected timestamp).
 */
export function setMode(
  form: FormRef,
  path: Path,
  mode: DerivationMode,
  options: SetModeOptions = {},
): void {
  const internalFormStore = internalOf(form);
  const store = getFieldStore(internalFormStore, path);
  const slot =
    store.kind === "value"
      ? envelopesKey.get(internalFormStore, store)
      : undefined;
  if (store.kind !== "value" || slot?.family !== "source") {
    throw new Error(
      `Not an estimate field (at ${JSON.stringify(path)}) — setMode needs a field with a source envelope slot`,
    );
  }

  batch(() => {
    untrack(() => {
      const live = slot.envelope.value;
      if ((live.mode === "formula" ? "formula" : "estimate") === mode) {
        return;
      }

      const now = options.now ?? new Date().toISOString();

      if (mode === "formula") {
        // Preserve the estimate as the meta half's carried manual value —
        // but only an EDITED value: the meta mirrors keystrokes, never the
        // loaded column value, so an unedited flip carries the decoded
        // `manualValue` forward unchanged
        const manualValue = store.isDirty.value
          ? isEmptyish(store.input.value)
            ? null
            : store.input.value
          : (live.manualValue ?? null);
        writeEnvelope(internalFormStore, store, slot, {
          ...live,
          mode: "formula",
          manualValue,
          lastFlippedAt: now,
        });
        return;
      }

      // Seed the estimate from the last formula result — a real edit
      const candidate = derivationKey.get(
        internalFormStore,
        store,
      )?.formulaValue.value;
      const seeded =
        candidate &&
        candidate.error === null &&
        candidate.value !== undefined
          ? candidate.value
          : live.value;
      writeEnvelope(internalFormStore, store, slot, {
        ...live,
        mode: "estimate",
        value: seeded,
        lastFlippedAt: now,
      });
      if (
        candidate &&
        candidate.error === null &&
        candidate.value !== undefined
      ) {
        store.isTouched.value = true;
        store.isEdited.value = true;
      }
    });
  });
}
