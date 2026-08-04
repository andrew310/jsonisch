import { inferControl } from "../control";
import { isSafeKey, readOwn } from "../schema-utils";
import type { JsonSchema } from "../types";

/**
 * Decodes the companion meta blobs (`<key>Source`/`<key>Hybrid`) of a
 * nested server record for `FormConfig.companions` — the meta-channel twin
 * of `decodeRecord`, which deliberately strips these keys (they are meta
 * state, not fields).
 *
 * Companions always live in the record's `data` JSONB bag: their base
 * field must be a non-column field for the companion to persist (the
 * `encodeDirty` rule), and every server write path merges them into
 * `data`. Only declared bases with the matching control produce a lookup —
 * estimate fields read `<key>Source`, amount-or-percent fields read
 * `<key>Hybrid` — so a stray record key can never smuggle meta state in.
 *
 * For flat-JSONB surfaces without column routing, pass the bag as
 * `{ data: bag }` (same convention as `decodeRecord`).
 *
 * @param schema The form's JSON-Schema (object schema with properties).
 * @param record The server record (`{ …columns, data? }`).
 *
 * @returns The companion map keyed by companion key (`<key>Source`), or
 * `undefined` when the record is nullish or holds no companions.
 */
export function decodeCompanions(
  schema: JsonSchema,
  record: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (record == null) return undefined;

  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : undefined;
  if (data == null) return undefined;

  const properties = schema.properties ?? {};
  const companions: Record<string, unknown> = {};
  let found = false;

  for (const key of Object.keys(properties)) {
    if (!isSafeKey(key)) continue;
    const control = inferControl(properties[key]);
    const suffix =
      control === "estimate"
        ? "Source"
        : control === "amount-or-percent"
          ? "Hybrid"
          : undefined;
    if (!suffix) continue;

    const value = readOwn(data, `${key}${suffix}`);
    if (value !== undefined) {
      companions[`${key}${suffix}`] = value;
      found = true;
    }
  }
  return found ? companions : undefined;
}
