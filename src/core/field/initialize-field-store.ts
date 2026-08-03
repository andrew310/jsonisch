import { inferControl } from "../control";
import { createId, createSignal } from "../framework";
import {
  containerPresence,
  isSafeKey,
  primaryType,
  readOwn,
  resolveValueInput,
  typeList,
} from "../schema-utils";
import type {
  FieldElement,
  InternalArrayStore,
  InternalFieldStore,
  InternalFormStore,
  InternalObjectStore,
  InternalValueStore,
  JsonSchema,
  Path,
} from "../types";

/**
 * Initializes a field store recursively based on the JSON-Schema structure:
 * `properties` → object store, single-schema `items` → array store,
 * everything else → value store. The schema is the allow-list — only
 * declared property keys create nodes, so undeclared `initialInput` keys
 * never enter form state.
 *
 * @param internalFormStore The form store providing the empty input config.
 * @param internalFieldStore The partial field store to initialize.
 * @param schema The JSON-Schema node defining the field structure.
 * @param initialInput The initial input value.
 * @param path The path to the field in the form.
 * @param optional Whether the parent declares this field optional (not in
 * its `required` list).
 */
export function initializeFieldStore(
  internalFormStore: InternalFormStore,
  internalFieldStore: Partial<InternalFieldStore>,
  schema: JsonSchema,
  initialInput: unknown,
  path: Path,
  optional = false,
): void {
  const types = typeList(schema);
  const nullish = optional || types.includes("null");
  const primary = primaryType(schema);

  // Set basic properties
  internalFieldStore.schema = schema;
  internalFieldStore.name = String(path[path.length - 1] ?? "");
  internalFieldStore.path = path;
  internalFieldStore.control = inferControl(schema);
  internalFieldStore.isNullish = nullish;

  // Initialize elements array and common signals. `initialElements` and
  // `elements` start as the same array so `reset` can restore elements that
  // array methods move between field stores (see `InternalBaseStore`).
  const initialElements: FieldElement[] = [];
  internalFieldStore.initialElements = initialElements;
  internalFieldStore.elements = initialElements;
  internalFieldStore.errors = createSignal(null);
  internalFieldStore.isTouched = createSignal(false);
  internalFieldStore.isEdited = createSignal(false);
  internalFieldStore.isDirty = createSignal(false);

  // If schema declares properties, initialize as object field
  if (schema.properties && typeof schema.properties === "object") {
    const objectStore = internalFieldStore as Partial<InternalObjectStore>;
    objectStore.kind = "object";
    // Prototype-less record: with a plain `{}`, a declared prototype-named
    // key like "toString" would resolve the inherited function and `??=`
    // would never create its child store
    objectStore.children ??= Object.create(null) as Record<
      string,
      InternalFieldStore
    >;

    // Initialize child for each declared property, skipping unsafe keys so
    // a malicious schema cannot pollute the children record or any output
    // object rebuilt from it
    const required = new Set(
      Array.isArray(schema.required) ? schema.required : [],
    );
    for (const key of Object.keys(schema.properties)) {
      if (!isSafeKey(key)) continue;
      objectStore.children[key] ??= {} as InternalFieldStore;
      initializeFieldStore(
        internalFormStore,
        objectStore.children[key],
        schema.properties[key],
        readOwn(initialInput, key),
        [...path, key],
        !required.has(key),
      );
    }

    // Set object input presence (nullish or true)
    const objectInput = containerPresence(nullish, initialInput);
    objectStore.initialInput = createSignal(objectInput);
    objectStore.startInput = createSignal(objectInput);
    objectStore.input = createSignal(objectInput);
    return;
  }

  // Otherwise, if schema is an array with a single item schema, initialize
  // as array field. Tuple form is unsupported; an array WITHOUT items stays
  // a value leaf below (its whole array is the value — legacy relation
  // arrays and option lists without item schemas).
  if (
    (primary === "array" || primary === undefined) &&
    schema.items !== undefined
  ) {
    if (Array.isArray(schema.items)) {
      throw new Error(
        `Tuple "items" schemas are not supported (at ${JSON.stringify(path)})`,
      );
    }
    const arrayStore = internalFieldStore as Partial<InternalArrayStore>;
    arrayStore.kind = "array";
    arrayStore.itemSchema = schema.items;
    arrayStore.children ??= [];

    // Initialize child for each initial input item
    if (Array.isArray(initialInput)) {
      for (let index = 0; index < initialInput.length; index++) {
        arrayStore.children[index] = {} as InternalFieldStore;
        initializeFieldStore(
          internalFormStore,
          arrayStore.children[index],
          schema.items,
          initialInput[index],
          [...path, index],
        );
      }
    }

    // Set array input presence (nullish or true)
    const arrayInput = containerPresence(nullish, initialInput);
    arrayStore.initialInput = createSignal(arrayInput);
    arrayStore.startInput = createSignal(arrayInput);
    arrayStore.input = createSignal(arrayInput);

    // Set items with unique IDs for each child
    const initialItems = Array.isArray(initialInput)
      ? initialInput.map(() => createId())
      : [];
    arrayStore.initialItems = createSignal(initialItems);
    arrayStore.startItems = createSignal(initialItems);
    arrayStore.items = createSignal(initialItems);
    return;
  }

  // Otherwise, reject object/map shapes that cannot hold field values —
  // an object type without declared properties has no allow-list to walk
  if (primary === "object" || schema.additionalProperties !== undefined) {
    throw new Error(
      `"object" schema without "properties" (map shape) is not supported (at ${JSON.stringify(path)})`,
    );
  }

  // Otherwise, initialize as value field (leaf node) when the schema can
  // hold a value: a declared type, a relation `$ref`, or an option shape
  if (
    primary !== undefined ||
    types.includes("null") ||
    typeof schema.$ref === "string" ||
    schema.enum !== undefined ||
    schema.oneOf !== undefined ||
    schema.const !== undefined
  ) {
    const valueStore = internalFieldStore as Partial<InternalValueStore>;
    valueStore.kind = "value";

    const valueInput = resolveValueInput(
      internalFormStore.emptyInput,
      schema,
      nullish,
      initialInput,
    );
    valueStore.initialInput = createSignal(valueInput);
    valueStore.startInput = createSignal(valueInput);
    valueStore.input = createSignal(valueInput);
    return;
  }

  // Remaining shapes are unsupported
  throw new Error(
    `Unsupported schema without "type", "properties", "items", "$ref", "enum", "oneOf" or "const" (at ${JSON.stringify(path)})`,
  );
}
