/**
 * PLACEHOLDER — a JSON-Schema node as stored in the database.
 *
 * TODO(LOS-539): replace with a structured type covering `properties`,
 * `items`, `type`, and our `x-*` vocabulary (`x-column`, `x-formula`,
 * `x-ui`, `x-field-type`, …) when the schema walk lands.
 */
export type JsonSchema = Record<string, unknown>;
