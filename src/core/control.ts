import type { JsonSchema } from "./types/schema";

/**
 * The UI-side vocabulary: what kind of widget a field renders as. Distinct
 * from JSON-Schema `type` — e.g. "string" can map to many kinds (text,
 * email, currency, …).
 *
 * Uses the settled jsonisch naming from day one (2026-08-03 naming session):
 * `formula` (was `calculated`), `estimate` (was `computed`),
 * `amount-or-percent` (was `hybrid`), `line-item` (was `ledger`). Legacy
 * values translate at read time; DB schemas are never migrated for naming.
 *
 * Closed set. Add explicitly when a new widget actually exists.
 */
const CONTROL_KINDS = [
  "text",
  "textarea",
  "number",
  "boolean",
  "date",
  "address",
  "email",
  "email-array",
  "phone",
  "phone-array",
  "link-array",
  "currency",
  "percent",
  "interest-rate",
  "ein",
  "ssn",
  "us-state",
  "legal-id",
  "select",
  "multiselect",
  // The one derived-field kind. A formula whose expression references a
  // collection is additionally classified a rollup — detected from the
  // expression (dep graph, later slice), never chosen here.
  "formula",
  // Formula wrapped with a provisional manually-entered value that stands
  // in until real data arrives (estimate-first chronology, NOT "override").
  "estimate",
  // Dual entry mode composing currency ↔ percent-of-basis.
  "amount-or-percent",
  // One structured money line ("Ledger line item" in UI copy).
  "line-item",
  // Array of objects with a fixed `items.properties` shape (repeating
  // sub-form, one card per item).
  "object-array",
  // Present in schema/data but never rendered.
  "hidden",
] as const;

export type ControlKind = (typeof CONTROL_KINDS)[number];

/**
 * Settled names resolve to themselves — derived from the closed set so the
 * union and the lookup can never drift apart.
 */
const settledKinds: ReadonlySet<string> = new Set(CONTROL_KINDS);

/**
 * Read-time translations for the legacy `x-field-type` vocabulary
 * (date-picker, multi-select, calculated, hybrid, …). Wire shapes and DB
 * schemas are never migrated for naming.
 */
const legacyControlMap: Record<string, ControlKind> = {
  calculated: "formula",
  computed: "estimate",
  hybrid: "amount-or-percent",
  ledger: "line-item",
  "multi-select": "multiselect",
  "checkbox-group": "multiselect",
  "us-state-select": "us-state",
  "date-picker": "date",
  "address-array": "address",
  checkbox: "boolean",
  switch: "boolean",
};

/**
 * Resolves an explicit control name (settled or legacy) to a `ControlKind`.
 */
function resolveControlName(value: unknown): ControlKind | undefined {
  if (typeof value !== "string") return undefined;
  if (settledKinds.has(value)) return value as ControlKind;
  return legacyControlMap[value];
}

/**
 * Reads the explicit control of a node: the `x-ui.control` namespace first,
 * then the legacy flat `x-field-type` key. Both channels accept settled and
 * legacy names.
 */
function readExplicitControl(schema: JsonSchema): ControlKind | undefined {
  const ui = schema["x-ui"];
  if (ui && typeof ui === "object") {
    return resolveControlName((ui as Record<string, unknown>).control);
  }
  return resolveControlName(schema["x-field-type"]);
}

/**
 * Returns whether the node's `type` includes the given JSON-Schema type.
 */
function hasType(schema: JsonSchema, type: string): boolean {
  return Array.isArray(schema.type)
    ? schema.type.includes(type)
    : schema.type === type;
}

/**
 * Reads the relation config of a node from the `x-relation` namespace or the
 * legacy flat `x-relation-target`/`x-relation-multiple` keys.
 */
function readRelation(
  schema: JsonSchema,
): { multiple: boolean | undefined } | undefined {
  const ns = schema["x-relation"];
  if (ns && typeof ns === "object") {
    const obj = ns as Record<string, unknown>;
    if (typeof obj.target !== "string") return undefined;
    return {
      multiple: typeof obj.multiple === "boolean" ? obj.multiple : undefined,
    };
  }
  if (typeof schema["x-relation-target"] !== "string") return undefined;
  const multiple = schema["x-relation-multiple"];
  return { multiple: typeof multiple === "boolean" ? multiple : undefined };
}

/**
 * Decides which UI widget kind a JSON-Schema node renders as.
 *
 * Precedence:
 *   1. Relations — `$ref`, array-of-`$ref`, or `x-relation`/legacy
 *      `x-relation-target`. Single → select, many → multiselect.
 *   2. Explicit `x-ui.control` or legacy `x-field-type` (translated), plus
 *      the `estimate: true` attribute promoting a formula to an estimate.
 *   3. `format` — JSON-Schema standard widget hints on strings.
 *   4. `type` — JSON-Schema primitive fallback.
 *
 * @param schema The JSON-Schema node.
 *
 * @returns The control kind.
 */
export function inferControl(schema: JsonSchema): ControlKind {
  // 1. Relations
  if (typeof schema.$ref === "string") return "select";
  const items = Array.isArray(schema.items) ? undefined : schema.items;
  if (hasType(schema, "array") && typeof items?.$ref === "string") {
    return "multiselect";
  }
  const relation = readRelation(schema);
  if (relation) {
    // Explicit `multiple` wins over the node's type — legacy data has
    // array-typed nodes that render a single picker (e.g. loan.assignee).
    const many = relation.multiple ?? hasType(schema, "array");
    return many ? "multiselect" : "select";
  }

  // 2. Explicit control (settled or legacy, translated at read time). A
  // formula field carrying `estimate: true` accepts a provisional
  // manually-entered value and renders as the estimate wrapper.
  const explicit = readExplicitControl(schema);
  if (explicit) {
    if (explicit === "formula" && schema.estimate === true) return "estimate";
    return explicit;
  }

  // 3. format on strings
  if (hasType(schema, "string")) {
    switch (schema.format) {
      case "date":
        return "date";
      case "email":
        return "email";
      case "phone":
        return "phone";
      case "ein":
        return "ein";
      case "us-state":
        return "us-state";
      case "currency":
        return "currency";
      case "percent":
        return "percent";
    }
    return "text";
  }

  // 4. type fallback
  if (hasType(schema, "number") || hasType(schema, "integer")) return "number";
  if (hasType(schema, "boolean")) return "boolean";

  if (hasType(schema, "array")) {
    // Array with uniqueItems + items.oneOf is the multiselect option-list
    // shape.
    if (schema.uniqueItems === true && Array.isArray(items?.oneOf)) {
      return "multiselect";
    }
    // Array of objects with a fixed shape — repeating sub-form.
    if (items && hasType(items, "object") && typeof items.properties === "object") {
      return "object-array";
    }
    return "text";
  }

  return "text";
}
