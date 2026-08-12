import { readOwn } from "../schema-utils";

/**
 * Where one server row's live state comes from after an id join.
 * `fromLocalIndex` is a local row whose id matches this server row; `null`
 * is a new server row (no id, or an id not present locally).
 */
export interface Align {
  readonly fromLocalIndex: number | null;
}

/**
 * Non-empty identity: `null`, `undefined`, and `""` do not join.
 */
function isUsableId(id: unknown): boolean {
  return id != null && id !== "";
}

/**
 * For each server index, the local row that supplies live state. Server
 * order is the result order. A local index is used at most once — two
 * server rows with the same id must not share one live store. Match only
 * when both sides have a usable id.
 *
 * The caller must not invoke this when the item schema has no `id`; those
 * arrays stay positional.
 */
export function alignRows(
  localIds: readonly unknown[],
  serverRows: readonly unknown[],
): Align[] {
  const used = new Set<number>();
  return serverRows.map((row) => {
    const serverId = readOwn(row, "id");
    if (!isUsableId(serverId)) return { fromLocalIndex: null };
    for (let index = 0; index < localIds.length; index++) {
      if (used.has(index) || localIds[index] !== serverId) continue;
      used.add(index);
      return { fromLocalIndex: index };
    }
    return { fromLocalIndex: null };
  });
}
