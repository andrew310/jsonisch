/**
 * canon is the record the domain's canonical loader returns; bagger
 * distributes it: schema-declared keys become form state through the
 * store's allow-list, the whole record becomes the off-form value bag.
 *
 * This module computes that off-form bag ("the shelf") as a pure function
 * of a schema and a canonical record — no store, no signals, so a later
 * task can call it identically from a plugin's `build` and from any
 * engine-less reader.
 */
import { readRelationConfig } from "../../core/relation/relation-config";
import type { JsonSchema } from "../../core/types/schema";
import { envelopesWire, isEnvelope } from "../envelopes/wire";

const DEFAULT_BAG = "data";
const DEFAULT_HANDLE = "loan";

export interface BaggerOptions {
  bag?: string;
  handle?: string;
  /**
   * Second classification source for row collections, union-ed with the
   * walked schema's own relation nodes (`collectionKeys`). The host passes
   * its DATASET schema here: which record keys hold rows is a property of
   * the record, not of the stage being rendered.
   */
  collectionsSchema?: JsonSchema;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The record keys that hold relation ROWS, from both classification
 * sources. The union is load-bearing in both directions:
 *
 * - `collectionsSchema` (the dataset schema) alone decides collections the
 *   walked schema does not configure. A stage that renders no assets tray
 *   still needs `assets` on the shelf as FLATTENED rows — left raw, every
 *   bag-resident key (`assignmentFee`) reads undefined per row and
 *   `SUM(assets[assignmentFee])` or a loan check silently computes 0.
 * - The walked schema alone declares relations the dataset schema lacks:
 *   registry-role slugs and fallback defs are synthesized per stage
 *   (`buildStageSchemaFromConfig`), so replacing rather than union-ing
 *   would drop those collections off the shelf.
 */
export function collectionKeys(
  schema: JsonSchema,
  collectionsSchema?: JsonSchema,
): Set<string> {
  const keys = new Set<string>();
  for (const properties of [schema.properties, collectionsSchema?.properties]) {
    for (const [key, node] of Object.entries(properties ?? {})) {
      if (readRelationConfig(node)?.many) keys.add(key);
    }
  }
  return keys;
}

/**
 * Merges a source row's `x-column` fields with its bag column — bag wins,
 * per the `x-column` save-routing authority (AI.md: read = row spread over
 * its `data`). INTACT merge only, no envelope unwrapping: a later task
 * seeds form rows from this output, and unwrapping here would hand the
 * store already-flattened envelope values, reproducing the LOS-461
 * regression.
 */
export function flattenSourceRow(
  row: Record<string, unknown>,
  bag: string,
): Record<string, unknown> {
  const bagValue = row[bag];
  return isPlainObject(bagValue) ? { ...row, ...bagValue } : { ...row };
}

/**
 * Unwraps every kind-envelope entry (estimate / amount-or-percent) in a
 * flattened row to its value half, in place on a shallow copy. Shelf-only:
 * the off-form bag is read-only display data, so it carries resolved
 * values, never the envelope's mode/meta half.
 */
function unwrapEnvelopes(
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const unwrapped: Record<string, unknown> = { ...flat };
  for (const key of Object.keys(unwrapped)) {
    const raw = unwrapped[key];
    if (isEnvelope(raw)) {
      unwrapped[key] = envelopesWire.unwrap!(raw).value;
    }
  }
  return unwrapped;
}

/**
 * Computes the off-form value bag for a canonical record: every declared
 * scalar and relation collection, bag-merged and envelope-unwrapped, plus
 * a `handle` alias holding the whole computed scope (so a formula or
 * widget can address `loan.termMonths` as readily as bare `termMonths`).
 */
export function computeBag(
  schema: JsonSchema,
  record: Record<string, unknown>,
  opts?: BaggerOptions,
): Record<string, unknown> {
  const bag = opts?.bag ?? DEFAULT_BAG;
  const handle = opts?.handle ?? DEFAULT_HANDLE;

  const scope = unwrapEnvelopes(flattenSourceRow(record, bag));

  for (const key of collectionKeys(schema, opts?.collectionsSchema)) {
    const source = record[key];
    // A single-pick relation (many: false, e.g. lendingBranch) holds a ref
    // OBJECT, not a row collection — the scalar pass above already placed
    // it on the shelf untouched, and overwriting it with `[]` would drop
    // it. The VALUE decides, not the classification: the two schemas can
    // disagree on a key's cardinality, and only one of them shaped the
    // record.
    if (isPlainObject(source)) continue;
    scope[key] = Array.isArray(source)
      ? source.map((row) =>
          unwrapEnvelopes(flattenSourceRow(row as Record<string, unknown>, bag)),
        )
      : [];
  }

  scope[handle] = { ...scope };
  return scope;
}
