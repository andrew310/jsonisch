/**
 * Merge a collection's canonical rows (the read model — full server rows
 * with calc fields pre-evaluated, delivered via `offFormValues`) with the
 * live form rows (the write model the user edits) for formula evaluation.
 *
 * Membership comes from the LIVE rows, so rows added or removed during the
 * form session are respected. Each live row is enriched from the canonical
 * row with the same `id`: live keys win (an explicit `null` means the user
 * cleared the field), canonical fills everything the live row doesn't
 * carry — core columns the write model never holds.
 *
 * One home for collection overlay (app re-exports this). The merged result
 * is for evaluation only; it is never written back into form state.
 */
export function mergeCollectionRows(
  canonicalRows: ReadonlyArray<Record<string, unknown>>,
  liveRows: unknown,
): Array<Record<string, unknown>> {
  if (!Array.isArray(liveRows)) return [...canonicalRows];

  const canonicalById = new Map<unknown, Record<string, unknown>>();
  for (const row of canonicalRows) {
    if (row && typeof row === "object" && "id" in row) {
      canonicalById.set(row.id, row);
    }
  }

  return liveRows.map((live) => {
    if (!live || typeof live !== "object") {
      return live as Record<string, unknown>;
    }
    const liveRow = live as Record<string, unknown>;
    const canonical = canonicalById.get(liveRow.id);
    if (!canonical) return liveRow;

    const merged: Record<string, unknown> = { ...canonical };
    for (const [key, value] of Object.entries(liveRow)) {
      if (value !== undefined) merged[key] = value;
    }
    // Drop keys neither side defines (e.g. canonical `undefined` columns)
    for (const key of Object.keys(merged)) {
      if (merged[key] === undefined) delete merged[key];
    }
    return merged;
  });
}
