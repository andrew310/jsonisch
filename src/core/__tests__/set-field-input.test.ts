import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../vitest/mock"),
);
vi.mock("../framework", () => frameworkMocks);

import { getFieldBool } from "../field/get-field-bool";
import { getFieldInput } from "../field/get-field-input";
import { setFieldInput } from "../field/set-field-input";
import {
  createTestStore,
  getArrayStore,
  getObjectStore,
  getValueStore,
  objectSchema,
} from "../vitest/utils";

beforeEach(resetIdCounter);

describe("setFieldInput", () => {
  describe("value fields", () => {
    test("should set string value", () => {
      const store = createTestStore(objectSchema({ name: { type: "string" } }));
      setFieldInput(store, ["name"], "John");
      expect(getValueStore(store, ["name"]).input.value).toBe("John");
    });

    test("should mark field as touched", () => {
      const store = createTestStore(objectSchema({ name: { type: "string" } }));
      setFieldInput(store, ["name"], "John");
      expect(getValueStore(store, ["name"]).isTouched.value).toBe(true);
    });

    test("should mark field as edited", () => {
      const store = createTestStore(objectSchema({ name: { type: "string" } }));
      setFieldInput(store, ["name"], "John");
      expect(getValueStore(store, ["name"]).isEdited.value).toBe(true);
    });

    test("should keep field edited after reverting to initial value", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }),
        { initialInput: { name: "John" } },
      );
      setFieldInput(store, ["name"], "Jane");
      setFieldInput(store, ["name"], "John");
      // Unlike `isDirty`, `isEdited` stays `true` even after the value is
      // changed back to its initial value
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(false);
      expect(getValueStore(store, ["name"]).isEdited.value).toBe(true);
    });

    test("should mark field as dirty when value changes", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }),
        { initialInput: { name: "John" } },
      );
      setFieldInput(store, ["name"], "Jane");
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(true);
    });
  });

  describe("semantic empty-aware dirty compare", () => {
    test("should not mark dirty for empty string from undefined", () => {
      const store = createTestStore(
        objectSchema({ name: { type: "string" } }, []),
      );
      setFieldInput(store, ["name"], "");
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(false);
    });

    test("should not mark dirty for NaN from undefined", () => {
      const store = createTestStore(objectSchema({ age: { type: "number" } }));
      setFieldInput(store, ["age"], NaN);
      expect(getValueStore(store, ["age"]).isDirty.value).toBe(false);
    });

    test("should not mark dirty for null from empty string", () => {
      const store = createTestStore(objectSchema({ name: { type: "string" } }));
      // Required string starts at its empty input ""
      setFieldInput(store, ["name"], null);
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(false);
    });

    test("should not mark dirty for undefined from null start", () => {
      const store = createTestStore(
        objectSchema({ name: { type: ["string", "null"] } }),
        { initialInput: { name: null } },
      );
      setFieldInput(store, ["name"], undefined);
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(false);
    });

    test("should not mark dirty for NaN from empty string", () => {
      const store = createTestStore(objectSchema({ age: { type: "number" } }), {
        emptyInput: { number: "" },
      });
      setFieldInput(store, ["age"], NaN);
      expect(getValueStore(store, ["age"]).isDirty.value).toBe(false);
    });

    test("should mark dirty when a value replaces an empty start", () => {
      const store = createTestStore(objectSchema({ age: { type: "number" } }));
      setFieldInput(store, ["age"], 0);
      expect(getValueStore(store, ["age"]).isDirty.value).toBe(true);
    });

    test("should clear dirty when an edit reverts to an equivalent empty", () => {
      const store = createTestStore(
        objectSchema({ name: { type: ["string", "null"] } }),
        { initialInput: { name: null } },
      );
      setFieldInput(store, ["name"], "Jane");
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(true);
      setFieldInput(store, ["name"], "");
      expect(getValueStore(store, ["name"]).isDirty.value).toBe(false);
    });

    test("should compare Date leaf values by time, not by enumerable keys", () => {
      const store = createTestStore(
        objectSchema({ closedAt: { type: "string", format: "date" } }, []),
        { initialInput: { closedAt: new Date("2026-01-01") } },
      );
      setFieldInput(store, ["closedAt"], new Date("2026-02-02"));
      expect(getValueStore(store, ["closedAt"]).isDirty.value).toBe(true);
      setFieldInput(store, ["closedAt"], new Date("2026-01-01"));
      expect(getValueStore(store, ["closedAt"]).isDirty.value).toBe(false);
    });

    test("should deep-compare an atomic array leaf", () => {
      // Items-less array-typed field: the whole array is the leaf value
      const store = createTestStore(
        objectSchema({
          assignee: { type: "array", "x-relation-target": "contact" },
        }),
        { initialInput: { assignee: ["ct_1", "ct_2"] } },
      );
      setFieldInput(store, ["assignee"], ["ct_1", "ct_3"]);
      expect(getValueStore(store, ["assignee"]).isDirty.value).toBe(true);
      // A recreated array with equal content is clean again
      setFieldInput(store, ["assignee"], ["ct_1", "ct_2"]);
      expect(getValueStore(store, ["assignee"]).isDirty.value).toBe(false);
    });
  });

  describe("object fields", () => {
    test("should set nested object value", () => {
      const store = createTestStore(
        objectSchema({ user: objectSchema({ name: { type: "string" } }) }),
      );
      setFieldInput(store, ["user", "name"], "John");
      expect(getValueStore(store, ["user", "name"]).input.value).toBe("John");
    });

    test("should mark parent input as truthy when setting nested field", () => {
      const store = createTestStore(
        objectSchema({
          user: {
            ...objectSchema({ name: { type: "string" } }),
            type: ["object", "null"],
          },
        }),
        { initialInput: { user: null } },
      );
      setFieldInput(store, ["user", "name"], "John");
      expect(getObjectStore(store, ["user"]).input.value).toBe(true);
    });

    test("should mark a nullish parent dirty when a nested set makes it present", () => {
      // The child lands on a value semantically equal to its empty start
      // (clean), but the container's null → present flip is a real change
      // and must reach the dirty projections
      const store = createTestStore(
        objectSchema({
          address: {
            ...objectSchema({ city: { type: "string" } }),
            type: ["object", "null"],
          },
        }),
        { initialInput: { address: null } },
      );
      setFieldInput(store, ["address", "city"], "");
      const address = getObjectStore(store, ["address"]);
      expect(address.input.value).toBe(true);
      expect(getValueStore(store, ["address", "city"]).isDirty.value).toBe(
        false,
      );
      expect(address.isDirty.value).toBe(true);
    });

    test("should not clear an array ancestor's length dirtiness on a nested set", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a"] } },
      );
      setFieldInput(store, ["items"], ["a", "b"]); // grow → length-dirty
      setFieldInput(store, ["items", 0], "a"); // nested set through ancestor
      expect(getArrayStore(store, ["items"]).isDirty.value).toBe(true);
    });

    test("should mark object as dirty when input becomes null", () => {
      const store = createTestStore(
        objectSchema({
          user: {
            ...objectSchema({ name: { type: "string" } }),
            type: ["object", "null"],
          },
        }),
        { initialInput: { user: { name: "John" } } },
      );
      setFieldInput(store, ["user"], null);
      expect(getObjectStore(store, ["user"]).isDirty.value).toBe(true);
    });
  });

  describe("array fields", () => {
    test("should set array item value", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b"] } },
      );
      setFieldInput(store, ["items", 0], "updated");
      expect(getValueStore(store, ["items", 0]).input.value).toBe("updated");
    });

    test("should truncate array when setting shorter array", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b", "c"] } },
      );
      setFieldInput(store, ["items"], ["x"]);
      expect(getArrayStore(store, ["items"]).items.value).toHaveLength(1);
      expect(getFieldInput(getArrayStore(store, ["items"]))).toStrictEqual([
        "x",
      ]);
    });

    test("should extend array when setting longer array", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a"] } },
      );
      setFieldInput(store, ["items"], ["x", "y", "z"]);
      const items = getArrayStore(store, ["items"]);
      expect(items.items.value).toHaveLength(3);
      expect(getFieldInput(items)).toStrictEqual(["x", "y", "z"]);
    });

    test("should treat a non-array input on an array field as present empty", () => {
      // An unparsed JSON string has a .length and is indexable — it must
      // not be spread character-by-character into item stores
      const store = createTestStore(
        objectSchema({ tags: { type: "array", items: { type: "string" } } }),
        { initialInput: { tags: ["a", "b"] } },
      );
      setFieldInput(store, ["tags"], '["a","b"]');
      const tags = getArrayStore(store, ["tags"]);
      expect(tags.items.value).toHaveLength(0);
      expect(tags.input.value).toBe(true);
      expect(getFieldInput(tags)).toStrictEqual([]);
    });

    test("should throw when addressing a stale index past a shrunk array", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b", "c"] } },
      );
      setFieldInput(store, ["items"], ["a"]);
      // children[1]/[2] are deliberately kept for baseline reuse, but they
      // are not addressable — an edit there would vanish from every
      // items-length reader (getInput, getDirtyInput, walk)
      expect(() => setFieldInput(store, ["items", 1], "x")).toThrow(
        "not declared in the schema",
      );
    });

    test("should set null for nullish array", () => {
      const store = createTestStore(
        objectSchema(
          { items: { type: "array", items: { type: "string" } } },
          [],
        ),
        { initialInput: { items: ["a"] } },
      );
      setFieldInput(store, ["items"], null);
      expect(getArrayStore(store, ["items"]).input.value).toBeNull();
    });
  });

  describe("dirty state for arrays", () => {
    test("should mark array as dirty when length changes", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b"] } },
      );
      setFieldInput(store, ["items"], ["a"]);
      expect(getArrayStore(store, ["items"]).isDirty.value).toBe(true);
    });

    test("should clear array isDirty after reverting to initial input", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b", "c", "d"] } },
      );
      setFieldInput(store, ["items"], ["b", "c", "d"]);
      expect(getFieldBool(getArrayStore(store, ["items"]), "isDirty")).toBe(
        true,
      );
      setFieldInput(store, ["items"], ["a", "b", "c", "d"]);
      expect(getFieldBool(getArrayStore(store, ["items"]), "isDirty")).toBe(
        false,
      );
    });

    test("should clear array isDirty after reverting from longer back to initial", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b"] } },
      );
      setFieldInput(store, ["items"], ["a", "b", "c"]);
      expect(getFieldBool(getArrayStore(store, ["items"]), "isDirty")).toBe(
        true,
      );
      setFieldInput(store, ["items"], ["a", "b"]);
      expect(getFieldBool(getArrayStore(store, ["items"]), "isDirty")).toBe(
        false,
      );
    });
  });

  describe("reusing child stores when growing", () => {
    test("should clear stale errors but keep the dirty baseline when reused", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b", "c"] } },
      );
      const items = getArrayStore(store, ["items"]);
      // Give the third item a stale error, then shrink the array so its
      // child store becomes a stale, invisible leftover
      items.children[2].validationErrors.value = ["Stale error"];
      setFieldInput(store, ["items"], ["a"]);

      // Grow back so the stale child store is reused for a changed value
      setFieldInput(store, ["items"], ["a", "x", "y"]);

      // The reused child carries the new value with cleared errors, but
      // stays dirty because its value ("y") differs from its start ("c")
      expect(items.children[2].input.value).toBe("y");
      expect(items.children[2].errors.value).toBeNull();
      expect(items.children[2].isDirty.value).toBe(true);
    });

    test("should report dirty after shrinking then growing with changed values", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b", "c"] } },
      );
      setFieldInput(store, ["items"], ["a"]); // shrink
      setFieldInput(store, ["items"], ["a", "x", "y"]); // grow with changes
      // Same final input as a direct edit, so the array must be dirty
      expect(getFieldBool(getArrayStore(store, ["items"]), "isDirty")).toBe(
        true,
      );
    });

    test("should report clean after shrinking then growing back to initial", () => {
      const store = createTestStore(
        objectSchema({ items: { type: "array", items: { type: "string" } } }),
        { initialInput: { items: ["a", "b", "c"] } },
      );
      setFieldInput(store, ["items"], ["a"]); // shrink
      setFieldInput(store, ["items"], ["a", "b", "c"]); // grow back
      // Content matches the initial input again, so the array must be clean
      expect(getFieldBool(getArrayStore(store, ["items"]), "isDirty")).toBe(
        false,
      );
    });

    test("should grow beyond the initial length with brand-new children", () => {
      const store = createTestStore(
        objectSchema({
          rows: {
            type: "array",
            items: objectSchema({ label: { type: "string" } }),
          },
        }),
        { initialInput: { rows: [{ label: "a" }] } },
      );
      setFieldInput(store, ["rows"], [{ label: "a" }, { label: "b" }]);
      const rows = getArrayStore(store, ["rows"]);
      expect(rows.items.value).toHaveLength(2);
      expect(getValueStore(store, ["rows", 1, "label"]).input.value).toBe("b");
      expect(getFieldBool(rows, "isDirty")).toBe(true);
    });
  });

  describe("allow-list enforcement", () => {
    test("should throw when setting an undeclared path", () => {
      const store = createTestStore(objectSchema({ name: { type: "string" } }));
      expect(() => setFieldInput(store, ["rogue"], "x")).toThrow(
        "not declared in the schema",
      );
    });

    test("should throw when setting an undeclared nested path", () => {
      const store = createTestStore(
        objectSchema({ user: objectSchema({ name: { type: "string" } }) }),
      );
      expect(() => setFieldInput(store, ["user", "ssn"], "x")).toThrow(
        "not declared in the schema",
      );
    });

    test("should drop undeclared keys when setting a whole object", () => {
      const store = createTestStore(
        objectSchema({ user: objectSchema({ name: { type: "string" } }) }),
      );
      setFieldInput(store, ["user"], { name: "John", rogue: "nope" });
      expect(getFieldInput(store)).toStrictEqual({ user: { name: "John" } });
    });
  });
});
