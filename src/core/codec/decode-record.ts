import { isSafeKey, readOwn } from "../schema-utils";
import type { JsonSchema } from "../types";

/**
 * Decodes a nested server record into the form's `initialInput` shape,
 * routing each declared root property by its `x-column` geometry:
 * `x-column: true` fields read from a real record column (a top-level
 * record key), everything else reads from the record's `data` JSONB bag.
 *
 * The schema is the allow-list — only declared property keys are read, so
 * undeclared record keys (including prototype-pollution keys and
 * `<key>Source`/`<key>Hybrid` companions, which are meta state, not
 * fields) never enter the result. Nested values pass through as-is; the
 * store walk applies the allow-list recursively when the result becomes
 * `initialInput`.
 *
 * For flat-JSONB surfaces without column routing (e.g. workflow form
 * tasks), pass the bag as `{ data: bag }`.
 *
 * @param schema The form's JSON-Schema (object schema with properties).
 * @param record The server record (`{ …columns, data? }`).
 *
 * @returns The decoded initial input, or `undefined` for a nullish record.
 */
export function decodeRecord(
  schema: JsonSchema,
  record: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (record == null) return undefined;

  const properties = schema.properties ?? {};
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : undefined;

  const input: Record<string, unknown> = {};
  for (const key of Object.keys(properties)) {
    if (!isSafeKey(key)) continue;
    const value =
      properties[key]["x-column"] === true
        ? readOwn(record, key)
        : readOwn(data, key);
    if (value !== undefined) {
      input[key] = value;
    }
  }
  return input;
}
