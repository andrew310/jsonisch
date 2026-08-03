import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../../core/vitest/mock"),
);
vi.mock("../../core/framework", () => frameworkMocks);

import {
  createTestStore,
  getValueStore,
  objectSchema,
} from "../../core/vitest/utils";
import {
  getDeepErrorEntries,
  getDeepErrors,
  getErrors,
  setErrors,
} from "../errors";

beforeEach(resetIdCounter);

const nestedSchema = objectSchema({
  name: { type: "string" },
  borrower: objectSchema({ email: { type: "string" } }),
  rows: {
    type: "array",
    items: objectSchema({ label: { type: "string" } }),
  },
});

describe("setErrors / getErrors", () => {
  test("should set and get form-level errors without a path", () => {
    const store = createTestStore(nestedSchema);

    setErrors(store, ["Something went wrong"]);

    expect(getErrors(store)).toStrictEqual(["Something went wrong"]);
    expect(store.errors.value).toStrictEqual(["Something went wrong"]);
  });

  test("should set and get field errors by path", () => {
    const store = createTestStore(nestedSchema);

    setErrors(store, ["Bad email"], ["borrower", "email"]);

    expect(getErrors(store, ["borrower", "email"])).toStrictEqual([
      "Bad email",
    ]);
    // Form-level errors are unaffected
    expect(getErrors(store)).toBeNull();
  });

  test("should clear errors with null", () => {
    const store = createTestStore(nestedSchema);
    setErrors(store, ["Bad"], ["name"]);

    setErrors(store, null, ["name"]);

    expect(getErrors(store, ["name"])).toBeNull();
  });

  test("should throw on an undeclared path", () => {
    const store = createTestStore(nestedSchema);

    expect(() => setErrors(store, ["Bad"], ["nope"])).toThrow(
      "is not declared in the schema",
    );
  });
});

describe("getDeepErrors", () => {
  test("should return null when nothing has errors", () => {
    const store = createTestStore(nestedSchema);

    expect(getDeepErrors(store)).toBeNull();
  });

  test("should aggregate root, nested and array-item errors depth-first", () => {
    const store = createTestStore(nestedSchema, {
      initialInput: { rows: [{ label: "a" }] },
    });
    setErrors(store, ["Root error"]);
    setErrors(store, ["Email error"], ["borrower", "email"]);
    setErrors(store, ["Row error"], ["rows", 0, "label"]);

    expect(getDeepErrors(store)).toStrictEqual([
      "Root error",
      "Email error",
      "Row error",
    ]);
  });

  test("should scope to the subtree at the given path", () => {
    const store = createTestStore(nestedSchema);
    setErrors(store, ["Root error"]);
    setErrors(store, ["Email error"], ["borrower", "email"]);

    expect(getDeepErrors(store, ["borrower"])).toStrictEqual(["Email error"]);
  });

  test("should surface errors of fields that are not currently rendered", () => {
    // No element registration exists in core tests — a collapsed group's
    // field is just a store without elements, and its errors still surface
    const store = createTestStore(nestedSchema);
    setErrors(store, ["Hidden error"], ["borrower", "email"]);

    expect(getValueStore(store, ["borrower", "email"]).elements).toHaveLength(
      0,
    );
    expect(getDeepErrors(store)).toStrictEqual(["Hidden error"]);
  });
});

describe("getDeepErrorEntries", () => {
  test("should return path-tagged entries in depth-first order", () => {
    const store = createTestStore(nestedSchema, {
      initialInput: { rows: [{ label: "a" }] },
    });
    setErrors(store, ["Root error"]);
    setErrors(store, ["Row error"], ["rows", 0, "label"]);

    expect(getDeepErrorEntries(store)).toStrictEqual([
      { path: [], errors: ["Root error"] },
      { path: ["rows", 0, "label"], errors: ["Row error"] },
    ]);
  });

  test("should return an empty list when nothing has errors", () => {
    const store = createTestStore(nestedSchema);

    expect(getDeepErrorEntries(store)).toStrictEqual([]);
  });
});
