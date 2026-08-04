import { getFieldStore } from "../core/field/get-field-store";
import { batch, untrack } from "../core/framework";
import type { EntryMode, InternalHybridMeta, Path } from "../core/types";
import { type FormRef, internalOf } from "./form-ref";

function hybridMetaOf(form: FormRef, path: Path): InternalHybridMeta {
  const store = getFieldStore(internalOf(form), path);
  if (store.kind !== "value" || store.meta?.family !== "hybrid") {
    throw new Error(
      `Not an amount-or-percent field (at ${JSON.stringify(path)}) — needs a field with a Hybrid meta channel`,
    );
  }
  return store.meta;
}

/**
 * Sets the entry mode of an amount-or-percent field (enter a dollar
 * amount, or a percent of the percent basis). Dirties the companion; the
 * field's own value — always the resolved dollar amount — is the widget's
 * to convert and write.
 *
 * @param form The form store containing the field.
 * @param path The path to the amount-or-percent field.
 * @param mode The entry mode.
 */
export function setEntryMode(form: FormRef, path: Path, mode: EntryMode): void {
  const meta = hybridMetaOf(form, path);
  batch(() => {
    untrack(() => {
      meta.entryMode.value = mode;
    });
  });
}

/**
 * Sets the percent basis of an amount-or-percent field (the loan field key
 * the percent is taken of). Dirties the companion; keeping the resolved
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
  const meta = hybridMetaOf(form, path);
  batch(() => {
    untrack(() => {
      meta.percentBasis.value = percentBasis;
    });
  });
}
