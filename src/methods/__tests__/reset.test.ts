import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../../core/vitest/mock"),
);
vi.mock("../../core/framework", () => frameworkMocks);

import {
  createTestStore,
  getArrayStore,
  getValueStore,
  issue,
  objectSchema,
} from "../../core/vitest/utils";
import { reset } from "../reset";
import { setInput } from "../set-input";

beforeEach(resetIdCounter);

const flatSchema = objectSchema({
  name: { type: "string" },
  age: { type: "number" },
});

const rowsSchema = objectSchema({
  rows: {
    type: "array",
    items: objectSchema({ label: { type: "string" } }),
  },
});

describe("reset", () => {
  test("should reset the whole form to its initial input", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    setInput(store, ["name"], "Jane");
    store.isSubmitted.value = true;
    const name = getValueStore(store, ["name"]);
    name.errors.value = ["Bad"];

    reset(store);

    expect(name.input.value).toBe("John");
    expect(name.startInput.value).toBe("John");
    expect(name.errors.value).toBeNull();
    expect(name.isTouched.value).toBe(false);
    expect(name.isEdited.value).toBe(false);
    expect(name.isDirty.value).toBe(false);
    expect(store.isSubmitted.value).toBe(false);
  });

  test("should reset only the field at the given path", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    setInput(store, ["name"], "Jane");
    setInput(store, ["age"], 6);
    store.isSubmitted.value = true;

    reset(store, { path: ["name"] });

    expect(getValueStore(store, ["name"]).input.value).toBe("John");
    expect(getValueStore(store, ["age"]).input.value).toBe(6);
    expect(getValueStore(store, ["age"]).isDirty.value).toBe(true);
    // A field reset never touches form-level submitted state
    expect(store.isSubmitted.value).toBe(true);
  });

  test("should keep the current input with keepInput and rebase the dirty baseline", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    setInput(store, ["name"], "Jane");
    const name = getValueStore(store, ["name"]);

    reset(store, { keepInput: true });

    // Input kept, but the baseline is back to the initial input, so the
    // field is dirty against it
    expect(name.input.value).toBe("Jane");
    expect(name.startInput.value).toBe("John");
    expect(name.isDirty.value).toBe(true);
    // Touched/edited are still cleared
    expect(name.isEdited.value).toBe(false);
  });

  test("should honor keepTouched, keepEdited and keepErrors", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    setInput(store, ["name"], "Jane");
    const name = getValueStore(store, ["name"]);
    name.errors.value = ["Bad"];

    reset(store, { keepTouched: true, keepEdited: true, keepErrors: true });

    expect(name.input.value).toBe("John");
    expect(name.isTouched.value).toBe(true);
    expect(name.isEdited.value).toBe(true);
    expect(name.errors.value).toStrictEqual(["Bad"]);
  });

  test("should honor keepSubmitted", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John" },
    });
    store.isSubmitted.value = true;

    reset(store, { keepSubmitted: true });

    expect(store.isSubmitted.value).toBe(true);
  });

  test("should reset to a new initial input when provided", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    setInput(store, ["name"], "Jane");

    reset(store, { initialInput: { name: "Alice", age: 30 } });

    const name = getValueStore(store, ["name"]);
    expect(name.input.value).toBe("Alice");
    expect(name.startInput.value).toBe("Alice");
    expect(name.initialInput.value).toBe("Alice");
    expect(name.isDirty.value).toBe(false);
    expect(getValueStore(store, ["age"]).input.value).toBe(30);
  });

  test("should treat an explicit undefined initialInput as the empty input", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });

    reset(store, { initialInput: undefined });

    // Required string resets to "", required number to undefined
    expect(getValueStore(store, ["name"]).input.value).toBe("");
    expect(getValueStore(store, ["age"]).input.value).toBeUndefined();
  });

  test("should keep the existing baseline when initialInput is omitted", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });
    setInput(store, ["name"], "Jane");

    reset(store, { keepTouched: true });

    expect(getValueStore(store, ["name"]).input.value).toBe("John");
  });

  test("should reset a field to a new initial input by path", () => {
    const store = createTestStore(flatSchema, {
      initialInput: { name: "John", age: 5 },
    });

    reset(store, { path: ["name"], initialInput: "Alice" });

    expect(getValueStore(store, ["name"]).input.value).toBe("Alice");
    expect(getValueStore(store, ["age"]).input.value).toBe(5);
  });

  test("should stay clean when an empty string resets against a nullish baseline", () => {
    const store = createTestStore(
      objectSchema({ nickname: { type: ["string", "null"] } }),
      { initialInput: { nickname: null } },
    );
    setInput(store, ["nickname"], "JJ");

    reset(store, { keepInput: true, initialInput: "" });

    // "" against a "" baseline — clean; and the semantic compare treats
    // null ≡ "" anyway
    const nickname = getValueStore(store, ["nickname"]);
    expect(nickname.input.value).toBe("JJ");
    expect(nickname.isDirty.value).toBe(true);

    setInput(store, ["nickname"], "");
    reset(store, { keepInput: true });
    expect(nickname.isDirty.value).toBe(false);
  });

  test("should shrink a grown array back to its initial items", () => {
    const store = createTestStore(rowsSchema, {
      initialInput: { rows: [{ label: "a" }] },
    });
    setInput(store, ["rows"], [{ label: "a" }, { label: "b" }]);
    const rows = getArrayStore(store, ["rows"]);
    expect(rows.items.value).toHaveLength(2);

    reset(store);

    expect(rows.items.value).toHaveLength(1);
    expect(rows.isDirty.value).toBe(false);
    expect(getValueStore(store, ["rows", 0, "label"]).input.value).toBe("a");
  });

  test("should keep a longer array with keepInput and stay dirty", () => {
    const store = createTestStore(rowsSchema, {
      initialInput: { rows: [{ label: "a" }] },
    });
    setInput(store, ["rows"], [{ label: "a" }, { label: "b" }]);
    const rows = getArrayStore(store, ["rows"]);

    reset(store, { keepInput: true });

    expect(rows.items.value).toHaveLength(2);
    expect(rows.isDirty.value).toBe(true);
  });

  test("should reset same-length array items to avoid a phantom-dirty array", () => {
    const store = createTestStore(rowsSchema, {
      initialInput: { rows: [{ label: "a" }, { label: "b" }] },
    });
    setInput(store, ["rows"], [{ label: "x" }, { label: "y" }]);
    const rows = getArrayStore(store, ["rows"]);

    reset(store, { keepInput: true });

    // Same length: the internal item IDs are reset so no invisible
    // length-tracking difference survives
    expect(rows.items.value).toStrictEqual(rows.initialItems.value);
    expect(rows.isDirty.value).toBe(false);
    // Values are kept and dirty individually
    expect(getValueStore(store, ["rows", 0, "label"]).input.value).toBe("x");
    expect(getValueStore(store, ["rows", 0, "label"]).isDirty.value).toBe(
      true,
    );
  });

  test("should validate after a form reset when the validate mode is initial", () => {
    const validator = vi.fn(() => [issue("/name", "Required")]);
    const store = createTestStore(flatSchema, {
      validator,
      validate: "initial",
    });

    reset(store);

    expect(validator).toHaveBeenCalledTimes(1);
    expect(getValueStore(store, ["name"]).errors.value).toStrictEqual([
      "Required",
    ]);
  });

  test("should restore each field's own elements after a state transfer moved them", () => {
    const store = createTestStore(rowsSchema, {
      initialInput: { rows: [{ label: "a" }, { label: "b" }] },
    });
    const first = getValueStore(store, ["rows", 0, "label"]);
    const second = getValueStore(store, ["rows", 1, "label"]);
    const firstElements = first.elements;
    const secondElements = second.elements;

    // Simulate what a reorder does: move the elements references
    const temp = first.elements;
    first.elements = second.elements;
    second.elements = temp;

    reset(store);

    expect(first.elements).toBe(firstElements);
    expect(second.elements).toBe(secondElements);
  });
});
