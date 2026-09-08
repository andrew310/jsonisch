/**
 * A JSON-Schema node as stored in the database.
 *
 * Structured over the keys the store walk and codec read; everything else
 * (including the `x-*` vocabulary: `x-column`, `x-formula`, `x-ui`,
 * `x-relation*`, …) is reachable through the index signature. Schemas are
 * runtime DB data — there is no compile-time value inference.
 */
export interface JsonSchema {
  /**
   * The JSON-Schema type. May be a union list (e.g. `["string", "null"]`
   * for nullable fields).
   */
  type?: string | string[];
  /**
   * Object properties. Presence makes the node an object field store.
   */
  properties?: Record<string, JsonSchema>;
  /**
   * Required property names of an object node. Properties not listed are
   * optional and default to `undefined` instead of their empty input.
   */
  required?: string[];
  /**
   * Array item schema. A single schema makes the node an array field store;
   * tuple form (an array of schemas) is not supported. An array-typed node
   * WITHOUT items stays a value leaf whose value is the whole array (legacy
   * relation arrays).
   */
  items?: JsonSchema | JsonSchema[];
  /**
   * String format hint (date, email, phone, currency, …).
   */
  format?: string;
  /**
   * Relation reference (`schema://…`). Makes the node a relation value leaf.
   */
  $ref?: string;
  enum?: unknown[];
  oneOf?: unknown[];
  const?: unknown;
  uniqueItems?: boolean;
  additionalProperties?: unknown;
  /**
   * Our `x-*` vocabulary and any other JSON-Schema keywords.
   */
  [key: string]: unknown;
}
