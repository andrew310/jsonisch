import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../../core/vitest/mock"),
);
vi.mock("../../core/framework", () => frameworkMocks);

import { createTestStore, objectSchema } from "../../core/vitest/utils";
import { pickDirty } from "../pick-dirty";
import { setInput } from "../set-input";

beforeEach(resetIdCounter);

const nullableUser = (properties: Record<string, { type: string }>) => ({
  ...objectSchema(properties),
  type: ["object", "null"],
});

describe("pickDirty", () => {
  test("should return undefined for a clean form", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, age: { type: "number" } }),
      { initialInput: { name: "John", age: 25 } },
    );

    expect(pickDirty(store, { name: "John", age: 25 })).toBeUndefined();
  });

  test("should return only the dirty key from a flat object", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, email: { type: "string" } }),
      { initialInput: { name: "John", email: "a@example.com" } },
    );
    setInput(store, ["email"], "b@example.com");

    expect(
      pickDirty(store, { name: "John", email: "b@example.com" }),
    ).toStrictEqual({ email: "b@example.com" });
  });

  test("should pull values from the supplied value, not the form", () => {
    const store = createTestStore(objectSchema({ age: { type: "string" } }), {
      initialInput: { age: "25" },
    });
    setInput(store, ["age"], "30");

    // The supplied value carries the VALIDATED output (number), not the
    // form's raw input (string)
    expect(pickDirty(store, { age: 30 })).toStrictEqual({ age: 30 });
  });

  test("should return the full current array when any item is dirty", () => {
    const store = createTestStore(
      objectSchema({ items: { type: "array", items: { type: "string" } } }),
      { initialInput: { items: ["a", "b", "c"] } },
    );
    setInput(store, ["items", 1], "B");

    expect(pickDirty(store, { items: ["a", "B", "c"] })).toStrictEqual({
      items: ["a", "B", "c"],
    });
  });

  test("should include dirty leaves under a clean object parent", () => {
    const store = createTestStore(
      objectSchema({
        user: objectSchema({
          email: { type: "string" },
          name: { type: "string" },
        }),
      }),
      { initialInput: { user: { email: "a@example.com", name: "John" } } },
    );
    setInput(store, ["user", "email"], "b@example.com");

    expect(
      pickDirty(store, { user: { email: "b@example.com", name: "John" } }),
    ).toStrictEqual({ user: { email: "b@example.com" } });
  });

  test("should include a dirty leaf whose value is undefined", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" } }, []),
      { initialInput: { name: "John" } },
    );
    setInput(store, ["name"], undefined);

    expect(pickDirty(store, { name: undefined })).toStrictEqual({
      name: undefined,
    });
  });

  test("should pass through the supplied value when an object was cleared to null", () => {
    const store = createTestStore(
      objectSchema({ user: nullableUser({ name: { type: "string" } }) }),
      { initialInput: { user: { name: "John" } } },
    );
    setInput(store, ["user"], null);

    expect(pickDirty(store, { user: null })).toStrictEqual({ user: null });
  });

  test("should skip a dirty key that is absent from the supplied value", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, email: { type: "string" } }),
      { initialInput: { name: "John", email: "a@example.com" } },
    );
    setInput(store, ["name"], "Jane");
    setInput(store, ["email"], "b@example.com");

    // `email` is dirty in the form but absent from the supplied value — it
    // is skipped rather than included as `undefined`
    expect(pickDirty(store, { name: "Jane" })).toStrictEqual({
      name: "Jane",
    });
  });

  test("should pass a diverging value through without throwing when an object is expected", () => {
    const store = createTestStore(
      objectSchema({
        name: { type: "string" },
        user: objectSchema({ email: { type: "string" } }),
      }),
      { initialInput: { name: "John", user: { email: "a@example.com" } } },
    );
    setInput(store, ["name"], "Jane");
    setInput(store, ["user", "email"], "b@example.com");

    // `user` expects an object, but a primitive, `null` or array is passed
    // — the value is returned as-is rather than crashing on `key in value`
    expect(pickDirty(store, { name: "Jane", user: "reshaped" })).toStrictEqual(
      { name: "Jane", user: "reshaped" },
    );
    expect(pickDirty(store, { name: "Jane", user: null })).toStrictEqual({
      name: "Jane",
      user: null,
    });
    expect(
      pickDirty(store, { name: "Jane", user: ["reshaped"] }),
    ).toStrictEqual({ name: "Jane", user: ["reshaped"] });
  });

  test("should return undefined when all dirty keys are absent from the supplied value", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, email: { type: "string" } }),
      { initialInput: { name: "John", email: "a@example.com" } },
    );
    setInput(store, ["email"], "b@example.com");

    // The form is dirty, but the only dirty key (`email`) is absent from
    // the supplied value, so the root result is empty
    expect(pickDirty(store, { name: "John" })).toBeUndefined();
  });

  test("should keep an empty object for a nested object whose dirty key is absent", () => {
    const store = createTestStore(
      objectSchema({
        user: objectSchema({
          email: { type: "string" },
          name: { type: "string" },
        }),
      }),
      { initialInput: { user: { email: "a@example.com", name: "John" } } },
    );
    setInput(store, ["user", "email"], "b@example.com");

    // `user` is dirty via `email`, but `email` is absent from the supplied
    // `user` object, so an empty object is kept rather than omitted
    expect(pickDirty(store, { user: { name: "John" } })).toStrictEqual({
      user: {},
    });
  });

  test("should return the full array atomically when a nested item field is dirty", () => {
    const store = createTestStore(
      objectSchema({
        users: {
          type: "array",
          items: objectSchema({ name: { type: "string" } }),
        },
      }),
      { initialInput: { users: [{ name: "John" }, { name: "Jane" }] } },
    );
    setInput(store, ["users", 0, "name"], "Johnny");

    // Arrays are atomic: the whole supplied array is returned, including
    // the clean second item
    expect(
      pickDirty(store, { users: [{ name: "Johnny" }, { name: "Jane" }] }),
    ).toStrictEqual({ users: [{ name: "Johnny" }, { name: "Jane" }] });
  });

  test("should not match a dirty prototype-named key against inherited members", () => {
    const store = createTestStore(
      objectSchema({ toString: { type: "string" } }),
      { initialInput: { toString: "custom" } },
    );
    setInput(store, ["toString"], "changed");

    // The supplied value has no OWN "toString" — the inherited function
    // must not be picked into the payload
    expect(pickDirty(store, {})).toBeUndefined();
  });

  test("should pass through an array that was cleared to nullish", () => {
    const store = createTestStore(
      objectSchema(
        { tags: { type: "array", items: { type: "string" } } },
        [],
      ),
      { initialInput: { tags: ["a", "b"] } },
    );
    setInput(store, ["tags"], null);

    expect(pickDirty(store, { tags: null })).toStrictEqual({ tags: null });
  });
});
