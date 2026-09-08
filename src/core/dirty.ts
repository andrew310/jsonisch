import type { ContainerInput } from "./types/field";

/**
 * Returns whether a value is semantically empty: `undefined`, `null`, the
 * empty string, or `NaN` (what a cleared number input parses to). These are
 * all "no value entered" and must never make a field dirty against each
 * other — the core semantic-dirty promise.
 */
export function isEmptyish(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "number" && Number.isNaN(value))
  );
}

/**
 * Returns whether a value is a plain object (prototype `Object.prototype`
 * or `null`, e.g. from `JSON.parse`). Class instances, Dates, Maps etc. are
 * NOT plain — comparing them by enumerable keys would call any two Dates
 * equal.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Deep structural equality for leaf values. Value leaves can hold arrays and
 * plain objects (e.g. multiselect relation arrays, `items`-less array
 * fields), which are recreated on every edit, so identity comparison is not
 * enough. Dates compare by time; other non-plain objects only by identity.
 */
function isDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item, index) => isDeepEqual(item, b[index]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(b, key) &&
          isDeepEqual(a[key], b[key]),
      )
    );
  }
  return false;
}

/**
 * Semantic, empty-aware equality between two leaf inputs: equal when both
 * are semantically empty (`null` ≡ `undefined` ≡ `""` ≡ `NaN`) or deeply
 * structurally equal.
 */
export function isSemanticEqual(a: unknown, b: unknown): boolean {
  if (isEmptyish(a) && isEmptyish(b)) return true;
  return isDeepEqual(a, b);
}

/**
 * Semantic equality between two container presence sentinels: `true` only
 * equals `true`; `null` and `undefined` (absent container) are equivalent.
 */
export function isPresenceEqual(a: ContainerInput, b: ContainerInput): boolean {
  return Object.is(a, b) || (a == null && b == null);
}
