import type { JsonSchema } from "./types/schema";

/**
 * Keys that must never become field names or object keys in any store or
 * output — assigning them on a plain object mutates its prototype chain
 * instead of creating an own property (OWASP CWE-915). Applies to schema
 * property names AND record keys, so neither a malicious schema nor a
 * malicious record can pollute.
 */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Returns whether a key is safe to use as an object property name.
 */
export function isSafeKey(key: string): boolean {
  return !UNSAFE_KEYS.has(key);
}

/**
 * Reads an own property of a record, or `undefined`. A declared key like
 * `"toString"` must resolve to a record value or nothing, never to an
 * inherited prototype member.
 */
export function readOwn(source: unknown, key: string | number): unknown {
  return source != null &&
    typeof source === "object" &&
    Object.prototype.hasOwnProperty.call(source, key)
    ? (source as Record<string | number, unknown>)[key]
    : undefined;
}

/**
 * Returns the node's JSON-Schema types as a list (`type` may be a union
 * like `["string", "null"]`).
 */
export function typeList(schema: JsonSchema): string[] {
  if (schema.type === undefined) return [];
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

/**
 * Returns the node's primary (non-`"null"`) JSON-Schema type, if any.
 */
export function primaryType(schema: JsonSchema): string | undefined {
  return typeList(schema).find((type) => type !== "null");
}

/**
 * Resolves the presence sentinel a container (array/object) input maps to:
 * the nullish value itself when the field accepts it, `true` otherwise.
 * The single rule shared by the walk, reset, and setInput so a container
 * value can never round-trip to two different states.
 */
export function containerPresence(
  nullish: boolean,
  input: unknown,
): true | null | undefined {
  return nullish && input == null ? (input as null | undefined) : true;
}

/**
 * Resolves a value-leaf input, falling back to the configured empty input
 * for the field's type when no input is provided (e.g. `""` for a required
 * string, so an untouched empty field matches the DOM). Nullish fields keep
 * `undefined`/`null` as they accept it. The single rule shared by the walk
 * and reset so a reset field can never disagree with a freshly mounted one.
 */
export function resolveValueInput(
  emptyInput: Record<string, unknown>,
  schema: JsonSchema,
  nullish: boolean,
  input: unknown,
): unknown {
  const primary = primaryType(schema);
  return input === undefined && !nullish && primary !== undefined
    ? emptyInput[primary]
    : input;
}
