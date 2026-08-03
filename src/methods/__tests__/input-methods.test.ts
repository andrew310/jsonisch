import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../../core/vitest/mock"),
);
vi.mock("../../core/framework", () => frameworkMocks);

import { createTestStore, objectSchema } from "../../core/vitest/utils";
import { getDirtyInput } from "../get-dirty-input";
import { getInput } from "../get-input";
import { setInput } from "../set-input";

beforeEach(resetIdCounter);

describe("setInput / getInput", () => {
  test("should set and read a field by path", () => {
    const store = createTestStore(objectSchema({ name: { type: "string" } }));
    setInput(store, ["name"], "John");
    expect(getInput(store, ["name"])).toBe("John");
  });

  test("should set the entire form with an empty path", () => {
    const store = createTestStore(
      objectSchema({
        name: { type: "string" },
        user: objectSchema({ email: { type: "string" } }),
      }),
      { initialInput: { name: "John", user: { email: "a@example.com" } } },
    );
    setInput(store, [], { name: "Jane", user: { email: "b@example.com" } });
    expect(getInput(store)).toStrictEqual({
      name: "Jane",
      user: { email: "b@example.com" },
    });
  });

  test("should reassemble nested input from the tree", () => {
    const store = createTestStore(
      objectSchema({
        user: objectSchema({ name: { type: "string" } }),
        tags: { type: "array", items: { type: "string" } },
      }),
      { initialInput: { user: { name: "John" }, tags: ["a"] } },
    );
    expect(getInput(store)).toStrictEqual({
      user: { name: "John" },
      tags: ["a"],
    });
  });

  test("should return nullish containers as-is", () => {
    const store = createTestStore(
      objectSchema(
        {
          user: {
            ...objectSchema({ name: { type: "string" } }),
            type: ["object", "null"],
          },
          tags: { type: "array", items: { type: "string" } },
        },
        ["tags"],
      ),
      { initialInput: { user: null } },
    );
    expect(getInput(store, ["user"])).toBeNull();
    expect(getInput(store, ["tags"])).toStrictEqual([]);
  });

  test("should throw when reading an undeclared path", () => {
    const store = createTestStore(objectSchema({ name: { type: "string" } }));
    expect(() => getInput(store, ["rogue"])).toThrow(
      "not declared in the schema",
    );
  });
});

describe("getDirtyInput", () => {
  test("should return undefined for a clean form", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" } }),
      { initialInput: { name: "John" } },
    );
    expect(getDirtyInput(store)).toBeUndefined();
  });

  test("should omit clean sibling keys", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, email: { type: "string" } }),
      { initialInput: { name: "John", email: "a@example.com" } },
    );
    setInput(store, ["email"], "b@example.com");
    expect(getDirtyInput(store)).toStrictEqual({ email: "b@example.com" });
  });

  test("should include dirty leaves under clean parents", () => {
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
    expect(getDirtyInput(store)).toStrictEqual({
      user: { email: "b@example.com" },
    });
  });

  test("should return arrays atomically in full", () => {
    const store = createTestStore(
      objectSchema({ items: { type: "array", items: { type: "string" } } }),
      { initialInput: { items: ["a", "b", "c"] } },
    );
    setInput(store, ["items", 1], "B");
    expect(getDirtyInput(store)).toStrictEqual({ items: ["a", "B", "c"] });
  });

  test("should scope to the given path", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, email: { type: "string" } }),
      { initialInput: { name: "John", email: "a@example.com" } },
    );
    setInput(store, ["email"], "b@example.com");
    expect(getDirtyInput(store, ["email"])).toBe("b@example.com");
    expect(getDirtyInput(store, ["name"])).toBeUndefined();
  });

  test("should exclude an edit that reverted to its start value", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" } }),
      { initialInput: { name: "John" } },
    );
    setInput(store, ["name"], "Jane");
    setInput(store, ["name"], "John");
    expect(getDirtyInput(store)).toBeUndefined();
  });
});
