import { describe, expect, test } from "vitest";

import { setInput } from "../../../methods/set-input";
import { setOffFormValues } from "../../../methods/set-off-form-values";
import { createFormStore } from "../../form/create-form-store";
import { getFieldStore } from "../../field/get-field-store";
import { createTestStore, objectSchema } from "../../vitest/utils";
import type { JsonSchema } from "../../types";
import { resolveConditionals } from "../resolve-conditionals";

/**
 * Builds a root schema whose `allOf` gates `gated` on
 * `transaction_type === "purchase"` (the seed-data conditional shape).
 */
function gatedSchema(extra?: Record<string, JsonSchema>): JsonSchema {
  return {
    ...objectSchema(
      {
        transaction_type: { type: "string" },
        gated: { type: "string" },
        ...extra,
      },
      [],
    ),
    allOf: [
      {
        if: { properties: { transaction_type: { const: "purchase" } } },
        then: { properties: { gated: {} } },
      },
    ],
  };
}

describe("resolveConditionals", () => {
  test("resolves const condition to equals for then-branch fields", () => {
    const rules = resolveConditionals(gatedSchema());
    expect(rules).toEqual({
      gated: { field: "transaction_type", op: "equals", value: "purchase" },
    });
  });

  test("else branch flips the op", () => {
    const rules = resolveConditionals({
      type: "object",
      properties: {},
      allOf: [
        {
          if: { properties: { kind: { const: "a" } } },
          then: { properties: { x: {} } },
          else: { properties: { y: {} } },
        },
      ],
    } as JsonSchema);
    expect(rules.x).toEqual({ field: "kind", op: "equals", value: "a" });
    expect(rules.y).toEqual({ field: "kind", op: "not-equals", value: "a" });
  });

  test("contains condition maps to contains / not-contains", () => {
    const rules = resolveConditionals({
      type: "object",
      properties: {},
      allOf: [
        {
          if: { properties: { tags: { contains: { const: "rehab" } } } },
          then: { properties: { budget: {} } },
          else: { properties: { simple: {} } },
        },
      ],
    } as JsonSchema);
    expect(rules.budget).toEqual({
      field: "tags",
      op: "contains",
      value: "rehab",
    });
    expect(rules.simple).toEqual({
      field: "tags",
      op: "not-contains",
      value: "rehab",
    });
  });

  test("first-match-wins across blocks; unsafe keys and malformed blocks skipped", () => {
    const rules = resolveConditionals({
      type: "object",
      properties: {},
      allOf: [
        "junk",
        { if: { properties: {} }, then: { properties: { x: {} } } },
        {
          if: { properties: { a: { const: 1 } } },
          then: { properties: { x: {}, __proto__: {} } },
        },
        {
          if: { properties: { b: { const: 2 } } },
          then: { properties: { x: {} } },
        },
      ],
    } as unknown as JsonSchema);
    expect(rules).toEqual({ x: { field: "a", op: "equals", value: 1 } });
  });

  test("no allOf resolves to no rules", () => {
    expect(resolveConditionals(objectSchema({ a: { type: "string" } }))).toEqual(
      {},
    );
  });
});

describe("visibility signals", () => {
  test("gated field toggles with the watched form value", () => {
    const form = createTestStore(gatedSchema(), {
      initialInput: { transaction_type: "refinance" },
    });
    const gated = getFieldStore(form, ["gated"]);
    expect(gated.visible?.value).toBe(false);

    setInput(form, ["transaction_type"], "purchase");
    expect(gated.visible?.value).toBe(true);
  });

  test("ungated fields carry no visibility signal", () => {
    const form = createTestStore(gatedSchema());
    expect(getFieldStore(form, ["transaction_type"]).visible).toBeUndefined();
    expect(getFieldStore(form, ["transaction_type"]).visibleWhen).toBeUndefined();
  });

  test("watched field off the form resolves from offFormValues", () => {
    // The WHEN watches a field that is not on this stage — the loan canon
    // in offFormValues fills it
    const schema: JsonSchema = {
      type: "object",
      properties: { gated: { type: "string" } },
      allOf: [
        {
          if: { properties: { off_stage_kind: { const: "bridge" } } },
          then: { properties: { gated: {} } },
        },
      ],
    } as JsonSchema;
    const form = createTestStore(schema, {
      offFormValues: { off_stage_kind: "bridge" },
    });
    const gated = getFieldStore(form, ["gated"]);
    expect(gated.visible?.value).toBe(true);

    setOffFormValues(form, { off_stage_kind: "rental" });
    expect(gated.visible?.value).toBe(false);
  });

  test("record-handle bracket ref reads off the parent handle (LOS-471)", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: { gated: { type: "string" } },
      allOf: [
        {
          if: {
            properties: { "loan[transaction_type]": { const: "purchase" } },
          },
          then: { properties: { gated: {} } },
        },
      ],
    } as JsonSchema;
    const form = createTestStore(schema, {
      offFormValues: { loan: { transaction_type: "purchase" } },
    });
    expect(getFieldStore(form, ["gated"]).visible?.value).toBe(true);

    // Handle absent → ref resolves undefined → equals-gated stays hidden
    setOffFormValues(form, {});
    expect(getFieldStore(form, ["gated"]).visible?.value).toBe(false);
  });

  test("contains rule watches an array-valued form field", () => {
    const schema: JsonSchema = {
      ...objectSchema(
        {
          features: { type: "array", items: { type: "string" } },
          budget: { type: "number" },
        },
        [],
      ),
      allOf: [
        {
          if: { properties: { features: { contains: { const: "rehab" } } } },
          then: { properties: { budget: {} } },
        },
      ],
    };
    const form = createTestStore(schema, {
      initialInput: { features: ["rental"] },
    });
    const budget = getFieldStore(form, ["budget"]);
    expect(budget.visible?.value).toBe(false);

    setInput(form, ["features"], ["rental", "rehab"]);
    expect(budget.visible?.value).toBe(true);
  });

  test("no visibility plugin means no visibility signal at all", () => {
    // Visibility is a registered plugin now: a form built without it reads
    // every field as always visible (the public store's `visible` default)
    const form = createFormStore({
      schema: gatedSchema(),
      initialInput: { transaction_type: "refinance" },
    });
    const gated = getFieldStore(form, ["gated"]);
    expect(gated.visible).toBeUndefined();
    expect(gated.visibleWhen).toBeUndefined();
  });

  test("hidden field keeps its value and dirtiness while invisible", () => {
    const form = createTestStore(gatedSchema(), {
      initialInput: { transaction_type: "purchase", gated: "kept" },
    });
    const gated = getFieldStore(form, ["gated"]);
    setInput(form, ["gated"], "edited");
    expect(gated.isDirty.value).toBe(true);

    // Hide it — state survives; visibility gates rendering only
    setInput(form, ["transaction_type"], "refinance");
    expect(gated.visible?.value).toBe(false);
    expect(gated.kind === "value" && gated.input.value).toBe("edited");
    expect(gated.isDirty.value).toBe(true);
  });
});
