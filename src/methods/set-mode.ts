import { isEmptyish } from "../core/dirty";
import { getFieldStore } from "../core/field/get-field-store";
import { setFieldInput } from "../core/field/set-field-input";
import { batch, untrack } from "../core/framework";
import type { DerivationMode, Path } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

/**
 * Options for `setMode`.
 */
export interface SetModeOptions {
  /**
   * The flip timestamp (ISO-8601) stamped into the companion's
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
 * - `estimate` → `formula`: the current input is preserved as the
 *   companion's `manualValue` and the field computes again. The derived
 *   value is NOT written into the input — derived values are outputs; the
 *   server recompute pass is their author.
 * - `formula` → `estimate`: the manual value is seeded from the last
 *   formula result (estimate-first chronology: when you stop trusting the
 *   formula you start from its current value and adjust), which marks the
 *   value dirty like any user edit.
 *
 * Either flip dirties the companion (`lastFlippedAt` stamped), so a flip
 * with no other edit still produces a payload.
 *
 * Works at any depth: an estimate field inside an array row has its own
 * meta channel, built from the row's companions (LOS-602). The throw is
 * reserved for a field that genuinely has none — a non-estimate control.
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
  if (store.kind !== "value" || !store.mode || store.meta?.family !== "source") {
    throw new Error(
      `Not an estimate field (at ${JSON.stringify(path)}) — setMode needs a field with a Source meta channel`,
    );
  }
  const meta = store.meta;

  batch(() => {
    untrack(() => {
      if (store.mode!.value === mode) return;

      if (mode === "formula") {
        // Preserve the estimate as the companion's carried manual value —
        // but only an EDITED value: janska's companion mirrors keystrokes,
        // never the loaded column value, so an unedited flip carries the
        // decoded `manualValue` forward unchanged
        if (store.isDirty.value) {
          meta.manualValue.value = isEmptyish(store.input.value)
            ? null
            : store.input.value;
        }
      } else {
        // Seed the estimate from the last formula result — a real edit
        const candidate = store.formulaValue?.value;
        if (candidate && candidate.error === null && candidate.value !== undefined) {
          setFieldInput(internalFormStore, path, candidate.value);
        }
      }

      store.mode!.value = mode;
      meta.lastFlippedAt.value = options.now ?? new Date().toISOString();
    });
  });
}
