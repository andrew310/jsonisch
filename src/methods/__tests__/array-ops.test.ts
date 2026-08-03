import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../../core/vitest/mock"),
);
vi.mock("../../core/framework", () => frameworkMocks);

import {
  createTestStore,
  getArrayStore,
  getObjectStore,
  getValueStore,
  objectSchema,
} from "../../core/vitest/utils";
import { insert, move, remove, swap } from "../array-ops";
import { getInput } from "../get-input";

beforeEach(resetIdCounter);

const rowsSchema = objectSchema({
  rows: {
    type: "array",
    items: objectSchema({ label: { type: "string" } }),
  },
});

function rowsStore(labels: string[]) {
  return createTestStore(rowsSchema, {
    initialInput: { rows: labels.map((label) => ({ label })) },
  });
}

function labels(store: ReturnType<typeof rowsStore>): string[] {
  const input = getInput(store, ["rows"]) as { label: string }[];
  return input.map((row) => row.label);
}

describe("insert", () => {
  test("should append to the end by default", () => {
    const store = rowsStore(["a", "b"]);

    insert(store, ["rows"], { initialInput: { label: "c" } });

    expect(labels(store)).toStrictEqual(["a", "b", "c"]);
    expect(getArrayStore(store, ["rows"]).items.value).toHaveLength(3);
  });

  test("should insert at an index and shift full state up, errors included", () => {
    const store = rowsStore(["a", "b"]);
    const secondLabel = getValueStore(store, ["rows", 1, "label"]);
    secondLabel.errors.value = ["b is bad"];
    secondLabel.isDirty.value = true;

    insert(store, ["rows"], { at: 1, initialInput: { label: "x" } });

    expect(labels(store)).toStrictEqual(["a", "x", "b"]);
    // The error travels with its row from index 1 to index 2
    expect(getValueStore(store, ["rows", 2, "label"]).errors.value).toStrictEqual(
      ["b is bad"],
    );
    expect(getValueStore(store, ["rows", 2, "label"]).isDirty.value).toBe(true);
    // The inserted slot is fresh
    expect(getValueStore(store, ["rows", 1, "label"]).errors.value).toBeNull();
  });

  test("should default a new item without initial input to its empty input", () => {
    const store = rowsStore(["a"]);

    insert(store, ["rows"]);

    expect(labels(store)).toStrictEqual(["a", ""]);
  });

  test("should mark the array touched, edited and dirty", () => {
    const store = rowsStore(["a"]);

    insert(store, ["rows"], { initialInput: { label: "b" } });

    const rows = getArrayStore(store, ["rows"]);
    expect(rows.isTouched.value).toBe(true);
    expect(rows.isEdited.value).toBe(true);
    expect(rows.isDirty.value).toBe(true);
  });

  test("should no-op on an invalid index", () => {
    const store = rowsStore(["a"]);

    insert(store, ["rows"], { at: 5 });
    insert(store, ["rows"], { at: -1 });

    expect(labels(store)).toStrictEqual(["a"]);
  });

  test("should mint a fresh item ID for the inserted row", () => {
    const store = rowsStore(["a", "b"]);
    const before = getArrayStore(store, ["rows"]).items.value;

    insert(store, ["rows"], { at: 0, initialInput: { label: "x" } });

    const after = getArrayStore(store, ["rows"]).items.value;
    expect(after).toHaveLength(3);
    expect(after.slice(1)).toStrictEqual(before);
    expect(before).not.toContain(after[0]);
  });

  test("should throw on a non-array path", () => {
    const store = createTestStore(objectSchema({ name: { type: "string" } }));

    expect(() => insert(store, ["name"])).toThrow(
      'Expected an array field at path ["name"]',
    );
  });
});

describe("remove", () => {
  test("should remove the item at the index and shift full state down", () => {
    const store = rowsStore(["a", "b", "c"]);
    const thirdLabel = getValueStore(store, ["rows", 2, "label"]);
    thirdLabel.errors.value = ["c is bad"];

    remove(store, ["rows"], 0);

    expect(labels(store)).toStrictEqual(["b", "c"]);
    // The error travels with its row from index 2 to index 1
    expect(
      getValueStore(store, ["rows", 1, "label"]).errors.value,
    ).toStrictEqual(["c is bad"]);
  });

  test("should drop an erroring row's error with the row", () => {
    const store = rowsStore(["a", "b"]);
    getValueStore(store, ["rows", 1, "label"]).errors.value = ["b is bad"];

    remove(store, ["rows"], 1);

    expect(labels(store)).toStrictEqual(["a"]);
    // No addressable row carries the removed error anymore
    expect(getValueStore(store, ["rows", 0, "label"]).errors.value).toBeNull();
  });

  test("should stay dirty after remove-then-insert at the same length", () => {
    const store = rowsStore(["a", "b"]);

    remove(store, ["rows"], 1);
    insert(store, ["rows"], { initialInput: { label: "b" } });

    // Same length, but item identity changed — the row was replaced
    expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(true);
  });

  test("should no-op on an invalid index", () => {
    const store = rowsStore(["a"]);

    remove(store, ["rows"], 3);
    remove(store, ["rows"], -1);

    expect(labels(store)).toStrictEqual(["a"]);
  });
});

describe("move", () => {
  test("should move an item forward with its full state", () => {
    const store = rowsStore(["a", "b", "c"]);
    getValueStore(store, ["rows", 0, "label"]).errors.value = ["a is bad"];

    move(store, ["rows"], 0, 2);

    expect(labels(store)).toStrictEqual(["b", "c", "a"]);
    expect(
      getValueStore(store, ["rows", 2, "label"]).errors.value,
    ).toStrictEqual(["a is bad"]);
    expect(getValueStore(store, ["rows", 0, "label"]).errors.value).toBeNull();
  });

  test("should move an item backward with its full state", () => {
    const store = rowsStore(["a", "b", "c"]);
    getValueStore(store, ["rows", 2, "label"]).errors.value = ["c is bad"];

    move(store, ["rows"], 2, 0);

    expect(labels(store)).toStrictEqual(["c", "a", "b"]);
    expect(
      getValueStore(store, ["rows", 0, "label"]).errors.value,
    ).toStrictEqual(["c is bad"]);
  });

  test("should no-op when the indices are equal or invalid", () => {
    const store = rowsStore(["a", "b"]);

    move(store, ["rows"], 1, 1);
    move(store, ["rows"], 0, 5);
    move(store, ["rows"], -1, 0);

    expect(labels(store)).toStrictEqual(["a", "b"]);
    expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(false);
  });

  test("should preserve the reset baseline so a reverting move detects clean", () => {
    const store = rowsStore(["a", "b", "c"]);

    move(store, ["rows"], 0, 2);
    expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(true);

    move(store, ["rows"], 2, 0);

    // Item identity is back in start order — the array is clean again
    expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(false);
    expect(labels(store)).toStrictEqual(["a", "b", "c"]);
  });
});

describe("swap", () => {
  test("should swap two items with their full state", () => {
    const store = rowsStore(["a", "b", "c"]);
    getValueStore(store, ["rows", 0, "label"]).errors.value = ["a is bad"];
    getValueStore(store, ["rows", 0, "label"]).isTouched.value = true;

    swap(store, ["rows"], 0, 2);

    expect(labels(store)).toStrictEqual(["c", "b", "a"]);
    expect(
      getValueStore(store, ["rows", 2, "label"]).errors.value,
    ).toStrictEqual(["a is bad"]);
    expect(getValueStore(store, ["rows", 2, "label"]).isTouched.value).toBe(
      true,
    );
    expect(getValueStore(store, ["rows", 0, "label"]).errors.value).toBeNull();
  });

  test("should swap the item IDs so React keys follow their rows", () => {
    const store = rowsStore(["a", "b"]);
    const [firstId, secondId] = getArrayStore(store, ["rows"]).items.value;

    swap(store, ["rows"], 0, 1);

    expect(getArrayStore(store, ["rows"]).items.value).toStrictEqual([
      secondId,
      firstId,
    ]);
  });

  test("should be clean again after swapping back", () => {
    const store = rowsStore(["a", "b"]);

    swap(store, ["rows"], 0, 1);
    expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(true);

    swap(store, ["rows"], 0, 1);
    expect(getArrayStore(store, ["rows"]).isDirty.value).toBe(false);
  });

  test("should no-op when the indices are equal or invalid", () => {
    const store = rowsStore(["a", "b"]);

    swap(store, ["rows"], 0, 0);
    swap(store, ["rows"], 0, 9);

    expect(labels(store)).toStrictEqual(["a", "b"]);
  });
});

describe("validation trigger", () => {
  test("should trigger input-mode validation after an array op", () => {
    const validator = vi.fn(() => null);
    const store = createTestStore(rowsSchema, {
      initialInput: { rows: [{ label: "a" }] },
      validator,
      validate: "input",
    });

    insert(store, ["rows"], { initialInput: { label: "b" } });
    expect(validator).toHaveBeenCalledTimes(1);

    remove(store, ["rows"], 1);
    expect(validator).toHaveBeenCalledTimes(2);
  });
});

describe("nullish ancestors", () => {
  test("should mark a nullish ancestor present when inserting through it", () => {
    const schema = objectSchema({
      group: {
        ...objectSchema({
          rows: { type: "array", items: { type: "string" } },
        }),
        type: ["object", "null"],
      },
    });
    const store = createTestStore(schema, {
      initialInput: { group: null },
    });

    insert(store, ["group", "rows"], { initialInput: "x" });

    const group = getObjectStore(store, ["group"]);
    expect(group.input.value).toBe(true);
    expect(group.isDirty.value).toBe(true);
    expect(getInput(store)).toStrictEqual({ group: { rows: ["x"] } });
  });
});
