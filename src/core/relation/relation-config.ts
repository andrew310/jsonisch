import type { JsonSchema } from "../types";

/**
 * The relation config a select/multiselect control may carry. Read
 * straight off the schema node at render time; jsonisch's `inferControl`
 * already classified the node select/multiselect, so this only decides
 * WHICH picker renders and with what search filters.
 *
 * Core home — bagger() classifies collections with this; host widgets
 * import it from the package root.
 */
export interface RelationConfig {
  /**
   * The related domain: `entity` | `contact` | `participant` | `party` |
   * `asset` (from the `schema://<target>` ref or the `x-relation` target).
   */
  target: string;
  /**
   * Whether the field holds many rows. Explicit `multiple` wins over the
   * node's type — legacy data has array-typed nodes that render a single
   * picker (e.g. loan.assignee).
   */
  many: boolean;
  /**
   * The participant role the picker searches for (drives placeholder,
   * trait filter fallback, and the add-button label).
   */
  role?: string | undefined;
  /**
   * The trait slugs filtering the search.
   */
  traits?: string[] | undefined;
  /**
   * Restricts search to entities that are members of the entity picked in
   * this sibling field (e.g. closingContact within lendingBranch).
   */
  parent?: string | undefined;
  /**
   * Mock search data (docs/demo surfaces only).
   */
  useMockData?: boolean | undefined;
  /**
   * The per-row nested sub-schema (stage-configured "fields on this
   * record"; the stage loader injects it into `items`).
   */
  items?: JsonSchema | undefined;
}

const SCHEMA_REF_PREFIX = "schema://";

function refTarget(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith(SCHEMA_REF_PREFIX)
    ? value.slice(SCHEMA_REF_PREFIX.length)
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function strArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((s) => typeof s === "string")
    ? (value as string[])
    : undefined;
}

function hasType(schema: JsonSchema, type: string): boolean {
  return Array.isArray(schema.type)
    ? schema.type.includes(type)
    : schema.type === type;
}

/**
 * Reads the widget extras (role, traits filter, …) that ride as sibling
 * keys on both relation forms — `x-relation` namespace first, flat vendor
 * keys as fallback.
 */
function readExtras(record: Record<string, unknown>): {
  role?: string | undefined;
  parent?: string | undefined;
  multiple?: boolean | undefined;
  traits?: string[] | undefined;
  useMockData?: boolean | undefined;
} {
  const ns = record["x-relation"];
  if (ns && typeof ns === "object") {
    const obj = ns as Record<string, unknown>;
    return {
      role: str(obj.role),
      parent: str(obj.parent),
      multiple: bool(obj.multiple),
      traits: strArray(obj.traits),
      useMockData: bool(obj.useMockData),
    };
  }
  return {
    role: str(record["x-relation-role"]),
    parent: str(record["x-relation-parent"]),
    multiple: bool(record["x-relation-multiple"]),
    traits: strArray(record["x-relation-traits"]),
    useMockData: bool(record["x-use-mock-data"]),
  };
}

/**
 * Reads a node's relation config, or `undefined` for a plain enum
 * select/multiselect. Two schema forms:
 *   1. Canonical — `$ref: schema://<target>` (one) or array of that ref
 *      (many); widget extras ride as sibling keys.
 *   2. Vendor — `x-relation` namespace or flat `x-relation-target`;
 *      cardinality follows the node's `type` unless `multiple` overrides.
 */
export function readRelationConfig(
  schema: JsonSchema,
): RelationConfig | undefined {
  const record = schema as Record<string, unknown>;
  const { multiple, ...extras } = readExtras(record);
  const items = Array.isArray(schema.items) ? undefined : schema.items;
  const nestedItems =
    items && typeof items.properties === "object" ? { items } : {};

  // Form 1: $ref / array-of-$ref
  const singleTarget = refTarget(schema.$ref);
  if (singleTarget) {
    return { target: singleTarget, many: false, ...extras };
  }
  const itemTarget = refTarget(items?.$ref);
  if (hasType(schema, "array") && itemTarget) {
    return { target: itemTarget, many: true, ...extras };
  }

  // Form 2: x-relation namespace / flat vendor keys. `items` carries the
  // stage-configured "fields on this record" sub-schema when the stage
  // loader replaced the bare ref with real item properties.
  const ns = record["x-relation"];
  const target =
    ns && typeof ns === "object"
      ? str((ns as Record<string, unknown>).target)
      : str(record["x-relation-target"]);
  if (!target) return undefined;
  return {
    target,
    many: multiple ?? hasType(schema, "array"),
    ...extras,
    ...nestedItems,
  };
}

/**
 * Maps a relation target to the party autocomplete's kind hint. The widget
 * only knows `entity` / `contact` / undefined (= search both); join-table
 * targets (`participant`, `party`) stay open.
 */
export function targetToKind(
  target: string,
): "entity" | "contact" | undefined {
  return target === "entity" || target === "contact" ? target : undefined;
}

/**
 * The sibling field a contact picker is scoped to (`memberOfEntityId`).
 *
 * Explicit `x-relation-parent` always wins. When it is missing — the live
 * artifact schema never carried the key — a contact relation whose traits
 * include exactly one sibling entity relation's role is scoped to that
 * sibling (LOS-860: titleOfficer traits `["title-company"]` → titleCompany).
 * Two matches is ambiguous, so no parent is invented.
 */
export function relationParentFieldName(
  schema: JsonSchema,
  path: readonly (string | number)[],
  relation: RelationConfig,
): string | undefined {
  if (relation.parent) return relation.parent;
  if (targetToKind(relation.target) !== "contact") return undefined;
  const traits = relation.traits ?? [];
  if (traits.length === 0) return undefined;
  const siblings = propertiesAtParent(schema, path);
  if (!siblings) return undefined;
  const fieldName = path[path.length - 1];
  if (typeof fieldName !== "string") return undefined;
  const matches: string[] = [];
  for (const [key, node] of Object.entries(siblings)) {
    if (key === fieldName) continue;
    const sibling = readRelationConfig(node);
    if (!sibling || targetToKind(sibling.target) !== "entity") continue;
    if (sibling.role && traits.includes(sibling.role)) matches.push(key);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function propertiesAtParent(
  schema: JsonSchema,
  path: readonly (string | number)[],
): Record<string, JsonSchema> | undefined {
  let node: JsonSchema = schema;
  for (const segment of path.slice(0, -1)) {
    if (typeof segment === "number") {
      const items = Array.isArray(node.items) ? undefined : node.items;
      if (!items) return undefined;
      node = items;
    } else {
      const next = node.properties?.[segment];
      if (!next) return undefined;
      node = next;
    }
  }
  return node.properties;
}

/**
 * The row-identity keys a relation row carries beyond the stage-configured
 * nested fields — the autocomplete result contracts (`PartySearchResult` /
 * `AssetSearchResult`), which the ref readers/mergers in relation-widgets
 * enumerate. The store walk applies the schema as a recursive allow-list,
 * and a stage-injected item schema declares ONLY the nested tray keys — so
 * these must be declared too or decoded rows lose their identity (empty
 * autocompletes, no trays, and no `id` for the baseline's id-match array
 * rebase). Declared as `hidden` controls: they walk and encode, never
 * render.
 */
const HIDDEN_STRING: JsonSchema = {
  type: "string",
  "x-ui": { control: "hidden" },
} as JsonSchema;

const PARTY_IDENTITY_PROPS: Record<string, JsonSchema> = {
  id: HIDDEN_STRING,
  pubId: HIDDEN_STRING,
  name: HIDDEN_STRING,
  kind: HIDDEN_STRING,
  // Entity members ride as an opaque array (no item schema → value leaf)
  members: { type: "array", "x-ui": { control: "hidden" } } as JsonSchema,
};

const ASSET_IDENTITY_PROPS: Record<string, JsonSchema> = {
  id: HIDDEN_STRING,
  label: HIDDEN_STRING,
  propertyType: HIDDEN_STRING,
  subtitle: HIDDEN_STRING,
  address1: HIDDEN_STRING,
  address2: HIDDEN_STRING,
  city: HIDDEN_STRING,
  region: HIDDEN_STRING,
  postalCode: HIDDEN_STRING,
  country: HIDDEN_STRING,
  formattedAddress: HIDDEN_STRING,
};

/**
 * The row-identity contract for a relation target. A relation whose item
 * schema declares NO properties never reaches `withRelationRowIdentity` —
 * its rows are a value leaf holding the whole object, with no allow-list to
 * thin them — so a host feeding such a relation from a canonical record
 * must project the rows against this same set itself.
 */
export function relationRowIdentityProps(
  target: string,
): Record<string, JsonSchema> {
  return target === "asset" ? ASSET_IDENTITY_PROPS : PARTY_IDENTITY_PROPS;
}

/**
 * Returns a schema whose multi-row relation item schemas additionally
 * declare the row-identity keys (stage-configured keys win on collision).
 * Apply to the STORE schema only — rendering iterates the configured keys
 * and skips hidden controls.
 */
export function withRelationRowIdentity(schema: JsonSchema): JsonSchema {
  const properties = schema.properties ?? {};
  let changed = false;
  const nextProps: Record<string, JsonSchema> = { ...properties };
  for (const [key, property] of Object.entries(properties)) {
    const relation = readRelationConfig(property);
    if (!relation?.many || !relation.items?.properties) continue;
    const identity = relationRowIdentityProps(relation.target);
    nextProps[key] = {
      ...property,
      items: {
        ...relation.items,
        properties: { ...identity, ...relation.items.properties },
      },
    } as JsonSchema;
    changed = true;
  }
  return changed ? { ...schema, properties: nextProps } : schema;
}
