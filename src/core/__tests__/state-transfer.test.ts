import { beforeEach, describe, expect, test } from "vitest";
import { vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../vitest/mock"),
);
vi.mock("../framework", () => frameworkMocks);

import { copyItemState } from "../field/copy-item-state";
import { setInitialFieldInput } from "../field/set-initial-field-input";
import { swapItemState } from "../field/swap-item-state";
import type { FieldElement, InternalValueStore } from "../types";
import {
  createTestStore,
  getArrayStore,
  getObjectStore,
  getValueStore,
  objectSchema,
} from "../vitest/utils";

beforeEach(resetIdCounter);

/**
 * A fake DOM element (core tests run without a DOM).
 */
function fakeElement(): FieldElement {
  return {} as FieldElement;
}

/**
 * Stamps a value store with distinctive state so transfers are observable.
 */
function stamp(
  store: InternalValueStore,
  value: string,
  element?: FieldElement,
): void {
  store.input.value = value;
  store.startInput.value = `${value}-start`;
  store.validationErrors.value = [`${value}-error`];
  store.isTouched.value = true;
  store.isEdited.value = true;
  store.isDirty.value = true;
  if (element) store.elements.push(element);
}

const itemsSchema = objectSchema({
  rows: {
    type: "array",
    items: objectSchema({ label: { type: "string" } }),
  },
});

describe("copyItemState", () => {
  test("should copy all value-store state including the elements reference", () => {
    const store = createTestStore(itemsSchema, {
      initialInput: { rows: [{ label: "a" }, { label: "b" }] },
    });
    const from = getValueStore(store, ["rows", 0, "label"]);
    const to = getValueStore(store, ["rows", 1, "label"]);
    const element = fakeElement();
    stamp(from, "moved", element);

    copyItemState(store, getObjectStore(store, ["rows", 0]), getObjectStore(store, ["rows", 1]));

    expect(to.input.value).toBe("moved");
    expect(to.startInput.value).toBe("moved-start");
    expect(to.errors.value).toStrictEqual(["moved-error"]);
    expect(to.isTouched.value).toBe(true);
    expect(to.isEdited.value).toBe(true);
    expect(to.isDirty.value).toBe(true);
    // The elements reference travels with the state
    expect(to.elements).toBe(from.elements);
    expect(to.elements).toContain(element);
  });

  test("should not copy the reset targets (initialInput, initialElements)", () => {
    const store = createTestStore(itemsSchema, {
      initialInput: { rows: [{ label: "a" }, { label: "b" }] },
    });
    const from = getValueStore(store, ["rows", 0, "label"]);
    const to = getValueStore(store, ["rows", 1, "label"]);
    const toInitialElements = to.initialElements;
    stamp(from, "moved");

    copyItemState(store, getObjectStore(store, ["rows", 0]), getObjectStore(store, ["rows", 1]));

    expect(to.initialInput.value).toBe("b");
    expect(to.initialElements).toBe(toInitialElements);
  });

  test("should copy nested array state and initialize missing destination children", () => {
    const schema = objectSchema({
      rows: {
        type: "array",
        items: objectSchema({
          tags: { type: "array", items: { type: "string" } },
        }),
      },
    });
    const store = createTestStore(schema, {
      initialInput: { rows: [{ tags: ["x", "y"] }, { tags: [] }] },
    });
    const fromTags = getArrayStore(store, ["rows", 0, "tags"]);
    const toTags = getArrayStore(store, ["rows", 1, "tags"]);
    expect(toTags.children).toHaveLength(0);

    copyItemState(store, getObjectStore(store, ["rows", 0]), getObjectStore(store, ["rows", 1]));

    expect(toTags.items.value).toBe(fromTags.items.value);
    expect(toTags.children).toHaveLength(2);
    expect(getValueStore(store, ["rows", 1, "tags", 0]).input.value).toBe("x");
    expect(getValueStore(store, ["rows", 1, "tags", 1]).input.value).toBe("y");
  });
});

describe("swapItemState", () => {
  test("should swap all value-store state in both directions", () => {
    const store = createTestStore(itemsSchema, {
      initialInput: { rows: [{ label: "a" }, { label: "b" }] },
    });
    const first = getValueStore(store, ["rows", 0, "label"]);
    const second = getValueStore(store, ["rows", 1, "label"]);
    const firstElement = fakeElement();
    stamp(first, "first", firstElement);
    const firstElements = first.elements;
    const secondElements = second.elements;

    swapItemState(store, getObjectStore(store, ["rows", 0]), getObjectStore(store, ["rows", 1]));

    expect(first.input.value).toBe("b");
    expect(first.errors.value).toBeNull();
    expect(first.isTouched.value).toBe(false);
    expect(first.isDirty.value).toBe(false);
    expect(second.input.value).toBe("first");
    expect(second.startInput.value).toBe("first-start");
    expect(second.errors.value).toStrictEqual(["first-error"]);
    expect(second.isTouched.value).toBe(true);
    expect(second.isDirty.value).toBe(true);
    // Element ownership swaps by reference
    expect(first.elements).toBe(secondElements);
    expect(second.elements).toBe(firstElements);
    expect(second.elements).toContain(firstElement);
  });

  test("should initialize missing children when nested array lengths differ", () => {
    const schema = objectSchema({
      rows: {
        type: "array",
        items: objectSchema({
          tags: { type: "array", items: { type: "string" } },
        }),
      },
    });
    const store = createTestStore(schema, {
      initialInput: { rows: [{ tags: ["x", "y"] }, { tags: [] }] },
    });

    swapItemState(store, getObjectStore(store, ["rows", 0]), getObjectStore(store, ["rows", 1]));

    // The two tag values now live under row 1
    expect(getArrayStore(store, ["rows", 0, "tags"]).items.value).toHaveLength(0);
    const toTags = getArrayStore(store, ["rows", 1, "tags"]);
    expect(toTags.items.value).toHaveLength(2);
    expect(getValueStore(store, ["rows", 1, "tags", 0]).input.value).toBe("x");
    expect(getValueStore(store, ["rows", 1, "tags", 1]).input.value).toBe("y");
  });
});

describe("setInitialFieldInput", () => {
  test("should rewrite the reset baseline of a value leaf without touching live state", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" } }),
      { initialInput: { name: "John" } },
    );
    const name = getValueStore(store, ["name"]);

    setInitialFieldInput(store, name, "Jane");

    expect(name.initialInput.value).toBe("Jane");
    expect(name.startInput.value).toBe("John");
    expect(name.input.value).toBe("John");
  });

  test("should fall back to the empty input for a required field set to explicit undefined", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, age: { type: "number" } }),
      { initialInput: { name: "John", age: 5 } },
    );

    setInitialFieldInput(store, getValueStore(store, ["name"]), undefined);
    setInitialFieldInput(store, getValueStore(store, ["age"]), undefined);

    // Required string falls back to "", other types to undefined
    expect(getValueStore(store, ["name"]).initialInput.value).toBe("");
    expect(getValueStore(store, ["age"]).initialInput.value).toBeUndefined();
  });

  test("should keep null on a nullable field", () => {
    const store = createTestStore(
      objectSchema({ nickname: { type: ["string", "null"] } }),
      { initialInput: { nickname: "JJ" } },
    );
    const nickname = getValueStore(store, ["nickname"]);

    setInitialFieldInput(store, nickname, null);

    expect(nickname.initialInput.value).toBeNull();
  });

  test("should recurse through object children and update presence", () => {
    const schema = objectSchema({
      address: {
        ...objectSchema({ city: { type: "string" } }),
        type: ["object", "null"],
      },
    });
    const store = createTestStore(schema, {
      initialInput: { address: { city: "Rome" } },
    });
    const address = getObjectStore(store, ["address"]);

    setInitialFieldInput(store, address, null);

    expect(address.initialInput.value).toBeNull();
    expect(getValueStore(store, ["address", "city"]).initialInput.value).toBe(
      "",
    );
  });

  test("should grow array children for a longer initial input and mint new item IDs", () => {
    const store = createTestStore(itemsSchema, {
      initialInput: { rows: [{ label: "a" }] },
    });
    const rows = getArrayStore(store, ["rows"]);
    const oldItems = rows.initialItems.value;

    setInitialFieldInput(store, rows, [
      { label: "x" },
      { label: "y" },
      { label: "z" },
    ]);

    expect(rows.initialItems.value).toHaveLength(3);
    expect(rows.initialItems.value).not.toStrictEqual(oldItems);
    expect(rows.children).toHaveLength(3);
    // The grown child is not yet addressable by path (live items still has
    // one row) — read it directly from the children
    const grownRow = rows.children[2];
    expect(grownRow.kind).toBe("object");
    if (grownRow.kind === "object") {
      expect(grownRow.children.label.initialInput.value).toBe("z");
    }
    // Live items are untouched — reset moves the baseline into live state
    expect(rows.items.value).toHaveLength(1);
  });

  test("should clear the reset target of children past a shorter initial input", () => {
    const store = createTestStore(itemsSchema, {
      initialInput: { rows: [{ label: "a" }, { label: "b" }] },
    });
    const rows = getArrayStore(store, ["rows"]);

    setInitialFieldInput(store, rows, [{ label: "only" }]);

    expect(rows.initialItems.value).toHaveLength(1);
    expect(
      getValueStore(store, ["rows", 0, "label"]).initialInput.value,
    ).toBe("only");
    // The out-of-range child's reset target resolves to the empty input
    expect(
      getValueStore(store, ["rows", 1, "label"]).initialInput.value,
    ).toBe("");
  });

  test("should set a nullish array baseline while normalizing children", () => {
    const schema = objectSchema({
      rows: {
        type: ["array", "null"],
        items: { type: "string" },
      },
    });
    const store = createTestStore(schema, {
      initialInput: { rows: ["a"] },
    });
    const rows = getArrayStore(store, ["rows"]);

    setInitialFieldInput(store, rows, null);

    expect(rows.initialInput.value).toBeNull();
    expect(rows.initialItems.value).toHaveLength(0);
  });
});
