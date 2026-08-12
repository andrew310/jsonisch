/**
 * How a server record becomes form state — one decode, then a fork:
 *
 *   Postgres row { …columns, data: { myField: { value, source|entry } } }
 *        │
 *        │  ① decodeRecord (this file): schema-declared keys only,
 *        │     envelopes pass through WHOLE
 *        ▼
 *   initialInput { myField: { value, source } }
 *        │
 *        │  ② createFormStore visits each declared field; an
 *        │     estimate/amount-or-percent field's envelope is read TWICE,
 *        │     once per half — both readers take the SAME raw object:
 *        ├──────────────────────────┬─────────────────────────────┐
 *        ▼                          ▼                             │
 *   value half → field input   meta half → envelope slot         │
 *   (`unwrapLeafInput`,        (`envelopes()` buildScope,        │
 *    core/plugin/driver.ts)     plugins/envelopes/plugin.ts)     │
 *
 * It is a FORK, not a chain: the meta reader consumes the original raw,
 * never the value reader's output, so the value a user sees and the mode
 * state next to it can never derive from different data. The same fork
 * re-runs on reset, `applyBaseline`, and array-row reuse — every path
 * funnels through the same two readers.
 */

import { inferControl } from "../control";
import type { WireContract } from "../plugin/types";
import { isSafeKey, readOwn } from "../schema-utils";
import type { JsonSchema } from "../types";

// The decode fork, drawn out: `docs/decode-fork.md` in this package.
// It is the one home for the diagram (record → columns vs `data` bag, and
// the envelope twin) — keep the picture there, not duplicated here.

/**
 * Options for `decodeRecord`.
 */
export interface DecodeRecordOptions {
  /**
   * Envelope wire contracts keyed by control kind — the form store's
   * `pluginDriver.envelopes`, or `envelopeContracts([envelopesWire])` on
   * the server. An envelope-control field reads its WHOLE envelope from
   * the `data` bag (falling back to the bare column value for a field
   * whose meta was never persisted); core unwraps the value half at the
   * leaf, and the owning plugin re-reads the meta half from the same raw.
   */
  envelopes?: ReadonlyMap<string, WireContract>;
}

/**
 * Decodes a nested server record into the form's `initialInput` shape,
 * routing each declared root property by its `x-column` geometry:
 * `x-column: true` fields read from a real record column (a top-level
 * record key), everything else reads from the record's `data` JSONB bag.
 *
 * The schema is the allow-list — only declared property keys are read, so
 * undeclared record keys (including prototype-pollution keys) never enter
 * the result. Nested values pass through as-is; the store walk applies the
 * allow-list recursively when the result becomes `initialInput`, and
 * unwraps envelope leaves (`{ value, source | entry }`) through the
 * registered wire contracts.
 *
 * For flat-JSONB surfaces without column routing (e.g. workflow form
 * tasks), pass the bag as `{ data: bag }`.
 *
 * @param schema The form's JSON-Schema (object schema with properties).
 * @param record The server record (`{ …columns, data? }`).
 * @param options Decode options (envelope wire contracts).
 *
 * @returns The decoded initial input, or `undefined` for a nullish record.
 */
export function decodeRecord(
  schema: JsonSchema,
  record: Record<string, unknown> | null | undefined,
  options: DecodeRecordOptions = {},
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

    const isColumn = properties[key]["x-column"] === true;
    let value: unknown;
    if (isColumn && options.envelopes?.has(inferControl(properties[key]))) {
      // A column-backed envelope field: the bag holds the envelope (the
      // source of truth), the column only a mirrored scalar. An explicit
      // `null` bag entry (a cleared field) wins over the stale mirror —
      // only a genuinely absent bag entry falls back to the column.
      const bagValue = readOwn(data, key);
      value = bagValue !== undefined ? bagValue : readOwn(record, key);
    } else {
      value = isColumn ? readOwn(record, key) : readOwn(data, key);
    }
    if (value !== undefined) {
      input[key] = value;
    }
  }
  return input;
}
