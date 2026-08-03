import { beforeEach, describe, expect, test, vi } from "vitest";

const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import("../vitest/mock"),
);
vi.mock("../framework", () => frameworkMocks);

import { getDirtyInput } from "../../methods/get-dirty-input";
import { getInput } from "../../methods/get-input";
import { pickDirty } from "../../methods/pick-dirty";
import { setInput } from "../../methods/set-input";
import { getFieldStore } from "../field/get-field-store";
import { createTestStore, objectSchema } from "../vitest/utils";

beforeEach(resetIdCounter);

/**
 * The schema is the allow-list (OWASP CWE-915 whitelist): keys in
 * `initialInput` not declared in the schema never enter form state and
 * never appear in any output projection. This is the one testable library
 * property that replaces today's three-place hidden-field coordination
 * inside JanskaForm.
 */
describe("allow-list invariant", () => {
  const schema = objectSchema(
    {
      name: { type: "string" },
      fee: { type: "number" },
    },
    ["name"],
  );

  test("should keep undeclared initialInput keys out of the tree", () => {
    const store = createTestStore(schema, {
      initialInput: { name: "John", softDeleted: "frozen DB value" },
    });
    expect(store.children.softDeleted).toBeUndefined();
  });

  test("should keep undeclared keys out of getInput", () => {
    const store = createTestStore(schema, {
      initialInput: { name: "John", softDeleted: "frozen" },
    });
    expect(getInput(store)).toStrictEqual({ name: "John", fee: undefined });
  });

  test("should keep undeclared keys out of dirty projections after edits", () => {
    const store = createTestStore(schema, {
      initialInput: { name: "John", softDeleted: "frozen" },
    });
    setInput(store, ["name"], "Jane");
    expect(getDirtyInput(store)).toStrictEqual({ name: "Jane" });
  });

  test("should never let pickDirty emit an undeclared key", () => {
    const store = createTestStore(schema, {
      initialInput: { name: "John" },
    });
    setInput(store, ["name"], "Jane");
    // Even when the supplied value carries extra keys, only declared dirty
    // keys survive the mask
    expect(
      pickDirty(store, { name: "Jane", softDeleted: "frozen" }),
    ).toStrictEqual({ name: "Jane" });
  });

  test("should throw when setInput targets an undeclared path", () => {
    const store = createTestStore(schema);
    expect(() => setInput(store, ["softDeleted"], "x")).toThrow(
      "not declared in the schema",
    );
  });

  test("should throw when resolving an undeclared field store", () => {
    const store = createTestStore(schema);
    expect(() => getFieldStore(store, ["softDeleted"])).toThrow(
      "not declared in the schema",
    );
  });

  test("should not create nodes for companion keys in initialInput", () => {
    // Companions are meta state, not fields — no field, no channel
    const store = createTestStore(schema, {
      initialInput: { fee: 100, feeSource: "manual", feeHybrid: { p: 1 } },
    });
    expect(store.children.feeSource).toBeUndefined();
    expect(store.children.feeHybrid).toBeUndefined();
    expect(getInput(store)).toStrictEqual({ name: "", fee: 100 });
  });

  test("should keep offFormValues independent of the schema (positive control)", () => {
    // Formulas may still read schema-absent (soft-deleted) fields via
    // offFormValues — it is built from the full record, not the schema
    const store = createTestStore(schema, {
      initialInput: { name: "John" },
      offFormValues: { softDeleted: "still readable", appraisedAiv: 1 },
    });
    expect(store.offFormValues.value).toStrictEqual({
      softDeleted: "still readable",
      appraisedAiv: 1,
    });
  });
});
