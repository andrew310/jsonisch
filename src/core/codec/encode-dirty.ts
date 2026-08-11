import { inferControl } from "../control";
import type { WireContract } from "../plugin/types";
import { isSafeKey } from "../schema-utils";
import type { JsonSchema } from "../types";

/**
 * The save payload partitioned by record geometry: real table columns and
 * `data` JSONB bag entries. Envelope fields (`{ value, source | entry }`)
 * always land WHOLE in `data`; an `x-column: true` envelope field also
 * mirrors its value half into `columns` (a write-through scalar for SQL
 * and list pages — the bag stays the source of truth).
 */
export interface EncodedDirty {
  columns: Record<string, unknown>;
  data: Record<string, unknown>;
}

/**
 * Options for `encodeDirty`.
 */
export interface EncodeDirtyOptions {
  /**
   * The real table columns that exist (server-side drizzle column keys).
   * When provided, an `x-column: true` key with no matching real column is
   * DROPPED instead of routed to `columns` — a schema declaring a column
   * that does not exist is an undeclared write path, and one bad key must
   * not fail the whole save (mirrors `partitionAssetRow`).
   */
  knownColumns?: ReadonlySet<string>;
  /**
   * The plugins' static wire contracts (`[companionsWire, derivationWire]`
   * for the standard trio). This function is isomorphic — the server
   * assembles the same list from the same exported descriptors, with no
   * form store anywhere (D7). Without contracts every declared value
   * passes through bare.
   */
  wire?: readonly WireContract[];
}

/**
 * Builds the envelope-control lookup from a wire list.
 */
export function envelopeContracts(
  wire: readonly WireContract[] | undefined,
): ReadonlyMap<string, WireContract> {
  const map = new Map<string, WireContract>();
  for (const contract of wire ?? []) {
    for (const control of contract.envelopeControls ?? []) {
      map.set(control, contract);
    }
  }
  return map;
}

/**
 * Encodes a dirty-values object (the `pickDirty`/`getDirtyInput` result)
 * into the save payload, partitioning each root key by its `x-column`
 * geometry: `x-column: true` fields become column updates, everything else
 * lands in the `data` bag. Undeclared keys — including prototype-pollution
 * keys — are dropped: the schema is the allow-list at the write boundary
 * too.
 *
 * Wire contracts carry each plugin's persistence policy (behavior
 * relocated verbatim from LOS-461, not redesigned): `skipValue` drops a
 * formula value (the server recompute is its only author), and an
 * envelope contract's `encode` normalizes the outgoing envelope (an
 * estimate value persists exactly when its meta pins `mode: "manual"`).
 *
 * @param schema The form's JSON-Schema (object schema with properties).
 * @param dirty The dirty values, or `undefined` when nothing is dirty.
 * @param options Encoding options (column set, wire contracts).
 *
 * @returns The partitioned payload, or `undefined` when nothing survives.
 */
export function encodeDirty(
  schema: JsonSchema,
  dirty: Record<string, unknown> | null | undefined,
  options: EncodeDirtyOptions = {},
): EncodedDirty | undefined {
  if (dirty == null) return undefined;

  const properties = schema.properties ?? {};
  const envelopes = envelopeContracts(options.wire);

  const columns: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};
  let hasEntries = false;

  for (const key of Object.keys(dirty)) {
    if (!isSafeKey(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;

    const property = properties[key];
    const control = inferControl(property);

    // Plugin skip policy (e.g. a formula value is always server-authored)
    if (options.wire?.some((w) => w.skipValue?.(control, dirty, key))) {
      continue;
    }

    const isColumn = property["x-column"] === true;
    const contract = envelopes.get(control);

    if (contract) {
      // Envelope field: normalize through the contract's server-side
      // policy, keep the envelope WHOLE in the data bag, and mirror the
      // value half into the column when one exists
      const encoded = contract.encode
        ? contract.encode(control, dirty[key])
        : dirty[key];
      if (encoded === undefined) continue;

      data[key] = encoded;
      if (isColumn && (!options.knownColumns || options.knownColumns.has(key))) {
        const value = contract.unwrap
          ? contract.unwrap(encoded).value
          : undefined;
        if (value !== undefined) {
          columns[key] = value;
        }
      }
      hasEntries = true;
      continue;
    }

    if (isColumn) {
      if (options.knownColumns && !options.knownColumns.has(key)) {
        // Declared column with no real table column — drop just this key
        continue;
      }
      columns[key] = dirty[key];
    } else {
      data[key] = dirty[key];
    }
    hasEntries = true;
  }

  return hasEntries ? { columns, data } : undefined;
}
