import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../../core/vitest/mock"),
);
vi.mock("../../core/framework", () => frameworkMocks);

import { createTestStore, objectSchema } from "../../core/vitest/utils";
import { getDirtyPaths } from "../get-dirty-paths";
import { setInput } from "../set-input";

beforeEach(resetIdCounter);

const nullableUser = (properties: Record<string, { type: string }>) => ({
  ...objectSchema(properties),
  type: ["object", "null"],
});

describe("getDirtyPaths", () => {
  test("should return empty array for a clean form", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, age: { type: "number" } }),
      { initialInput: { name: "John", age: 25 } },
    );

    expect(getDirtyPaths(store)).toStrictEqual([]);
  });

  test("should return path to a dirty top-level value", () => {
    const store = createTestStore(
      objectSchema({ name: { type: "string" }, email: { type: "string" } }),
      { initialInput: { name: "John", email: "a@example.com" } },
    );
    setInput(store, ["email"], "b@example.com");

    expect(getDirtyPaths(store)).toStrictEqual([["email"]]);
  });

  test("should return paths to multiple dirty values", () => {
    const store = createTestStore(
      objectSchema({
        name: { type: "string" },
        email: { type: "string" },
        age: { type: "number" },
      }),
      { initialInput: { name: "John", email: "a@example.com", age: 25 } },
    );
    setInput(store, ["email"], "b@example.com");
    setInput(store, ["age"], 26);

    expect(getDirtyPaths(store)).toStrictEqual([["email"], ["age"]]);
  });

  test("should return path to a nested dirty value", () => {
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

    expect(getDirtyPaths(store)).toStrictEqual([["user", "email"]]);
  });

  test("should return the array path when any item is dirty", () => {
    const store = createTestStore(
      objectSchema({ items: { type: "array", items: { type: "string" } } }),
      { initialInput: { items: ["a", "b", "c"] } },
    );
    setInput(store, ["items", 1], "B");

    expect(getDirtyPaths(store)).toStrictEqual([["items"]]);
  });

  test("should return only the array path when a nested object field inside an array is dirty", () => {
    const store = createTestStore(
      objectSchema({
        users: {
          type: "array",
          items: objectSchema({
            name: { type: "string" },
            age: { type: "number" },
          }),
        },
      }),
      {
        initialInput: {
          users: [
            { name: "John", age: 25 },
            { name: "Jane", age: 30 },
          ],
        },
      },
    );
    setInput(store, ["users", 0, "name"], "Johnny");

    expect(getDirtyPaths(store)).toStrictEqual([["users"]]);
  });

  test("should return the object path when an object was cleared to null", () => {
    const store = createTestStore(
      objectSchema({ user: nullableUser({ name: { type: "string" } }) }),
      { initialInput: { user: { name: "John" } } },
    );
    setInput(store, ["user"], null);

    expect(getDirtyPaths(store)).toStrictEqual([["user"]]);
  });

  test("should return the object path when an object transitioned from nullish without a dirty descendant", () => {
    const store = createTestStore(
      objectSchema({ user: nullableUser({ name: { type: "string" } }) }),
      { initialInput: { user: null } },
    );
    // The object's own presence flips (null → present), but the child
    // `name` lands on its empty input and stays clean
    setInput(store, ["user"], {});

    expect(getDirtyPaths(store)).toStrictEqual([["user"]]);
  });

  test("should emit only the leaf path when both the object and a descendant are dirty", () => {
    const store = createTestStore(
      objectSchema({ user: nullableUser({ name: { type: "string" } }) }),
      { initialInput: { user: null } },
    );
    // Both the object itself (null → present) and the `name` child flip
    // dirty — only the leaf path is emitted; the parent's dirty state is
    // implied by the descendant path and must not double-emit
    setInput(store, ["user"], { name: "John" });

    expect(getDirtyPaths(store)).toStrictEqual([["user", "name"]]);
  });

  test("should scope to the given path", () => {
    const store = createTestStore(
      objectSchema({
        user: objectSchema({
          email: { type: "string" },
          name: { type: "string" },
        }),
        meta: objectSchema({ visits: { type: "number" } }),
      }),
      {
        initialInput: {
          user: { email: "a@example.com", name: "John" },
          meta: { visits: 0 },
        },
      },
    );
    setInput(store, ["user", "email"], "b@example.com");
    setInput(store, ["meta", "visits"], 1);

    expect(getDirtyPaths(store, ["user"])).toStrictEqual([["user", "email"]]);
  });

  test("should return empty array when scoped to a clean subtree", () => {
    const store = createTestStore(
      objectSchema({
        user: objectSchema({ email: { type: "string" } }),
        other: { type: "string" },
      }),
      { initialInput: { user: { email: "a@example.com" }, other: "x" } },
    );
    setInput(store, ["other"], "y");

    expect(getDirtyPaths(store, ["user"])).toStrictEqual([]);
  });

  test("should return the path when scoped to a dirty value field", () => {
    const store = createTestStore(objectSchema({ name: { type: "string" } }), {
      initialInput: { name: "John" },
    });
    setInput(store, ["name"], "Jane");

    expect(getDirtyPaths(store, ["name"])).toStrictEqual([["name"]]);
  });

  test("should return the path when scoped to an array with a dirty item", () => {
    const store = createTestStore(
      objectSchema({ items: { type: "array", items: { type: "string" } } }),
      { initialInput: { items: ["a", "b", "c"] } },
    );
    setInput(store, ["items", 1], "B");

    expect(getDirtyPaths(store, ["items"])).toStrictEqual([["items"]]);
  });
});
