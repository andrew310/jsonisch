import { getFieldStore } from "../core/field/get-field-store";
import { batch, untrack } from "../core/framework";
import type { InternalFormStore, InternalValueStore, Path } from "../core/types";
import { writeEnvelope } from "../plugins/envelopes/envelope";
import { envelopesKey } from "../plugins/envelopes/key";
import type { EntryMode, HybridSlot } from "../plugins/envelopes/types";
import { type FormRef, internalOf } from "./form-ref";

function hybridOf(
  form: FormRef,
  path: Path,
): {
  form: InternalFormStore;
  store: InternalValueStore;
  slot: HybridSlot;
} {
  const internalFormStore = internalOf(form);
  const store = getFieldStore(internalFormStore, path);
  const slot =
    store.kind === "value"
      ? envelopesKey.get(internalFormStore, store)
      : undefined;
  if (store.kind !== "value" || slot?.family !== "hybrid") {
    throw new Error(
      `Not an amount-or-percent field (at ${JSON.stringify(path)}) — needs a field with a hybrid envelope slot`,
    );
  }
  return { form: internalFormStore, store, slot };
}

/**
 * Sets the entry mode of an amount-or-percent field (enter a dollar
 * amount, or a percent of the percent basis). Dirties the meta half; the
 * field's own value — always the resolved dollar amount — is the widget's
 * to convert and write.
 *
 * @param form The form store containing the field.
 * @param path The path to the amount-or-percent field.
 * @param mode The entry mode.
 */
export function setEntryMode(form: FormRef, path: Path, mode: EntryMode): void {
  const target = hybridOf(form, path);
  batch(() => {
    untrack(() => {
      writeEnvelope(target.form, target.store, target.slot, {
        ...target.slot.envelope.value,
        mode,
      });
    });
  });
}

/**
 * Sets the percent basis of an amount-or-percent field (the loan field key
 * the percent is taken of). Dirties the meta half; keeping the resolved
 * dollar amount constant against the new basis is the widget's job.
 *
 * @param form The form store containing the field.
 * @param path The path to the amount-or-percent field.
 * @param percentBasis The basis field key.
 */
export function setPercentBasis(
  form: FormRef,
  path: Path,
  percentBasis: string,
): void {
  const target = hybridOf(form, path);
  batch(() => {
    untrack(() => {
      writeEnvelope(target.form, target.store, target.slot, {
        ...target.slot.envelope.value,
        basis: percentBasis,
      });
    });
  });
}
