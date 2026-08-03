import { describe, expect, test } from "vitest";
import { inferControl } from "../control";

describe("inferControl", () => {
  describe("settled vocabulary translation (legacy x-field-type)", () => {
    test("should translate calculated to formula", () => {
      expect(
        inferControl({ type: "number", "x-field-type": "calculated" }),
      ).toBe("formula");
    });

    test("should translate computed to estimate", () => {
      expect(
        inferControl({ type: "number", "x-field-type": "computed" }),
      ).toBe("estimate");
    });

    test("should translate hybrid to amount-or-percent", () => {
      expect(inferControl({ type: "number", "x-field-type": "hybrid" })).toBe(
        "amount-or-percent",
      );
    });

    test("should translate ledger to line-item", () => {
      expect(inferControl({ type: "number", "x-field-type": "ledger" })).toBe(
        "line-item",
      );
    });

    test("should translate widget-style legacy names", () => {
      expect(
        inferControl({ type: "string", "x-field-type": "date-picker" }),
      ).toBe("date");
      expect(
        inferControl({ type: "array", "x-field-type": "multi-select" }),
      ).toBe("multiselect");
      expect(
        inferControl({ type: "array", "x-field-type": "checkbox-group" }),
      ).toBe("multiselect");
      expect(
        inferControl({ type: "string", "x-field-type": "us-state-select" }),
      ).toBe("us-state");
      expect(
        inferControl({ type: "array", "x-field-type": "address-array" }),
      ).toBe("address");
      expect(
        inferControl({ type: "boolean", "x-field-type": "checkbox" }),
      ).toBe("boolean");
      expect(inferControl({ type: "boolean", "x-field-type": "switch" })).toBe(
        "boolean",
      );
    });

    test("should pass settled names through unchanged", () => {
      expect(inferControl({ type: "number", "x-field-type": "formula" })).toBe(
        "formula",
      );
      expect(inferControl({ type: "number", "x-field-type": "estimate" })).toBe(
        "estimate",
      );
      expect(
        inferControl({ type: "number", "x-field-type": "amount-or-percent" }),
      ).toBe("amount-or-percent");
      expect(
        inferControl({ type: "number", "x-field-type": "line-item" }),
      ).toBe("line-item");
    });

    test("should promote a formula with estimate: true to estimate", () => {
      expect(
        inferControl({
          type: "number",
          "x-field-type": "formula",
          estimate: true,
        }),
      ).toBe("estimate");
      expect(
        inferControl({
          type: "number",
          "x-field-type": "calculated",
          estimate: true,
        }),
      ).toBe("estimate");
    });

    test("should read x-ui.control with the same translation", () => {
      expect(
        inferControl({ type: "number", "x-ui": { control: "calculated" } }),
      ).toBe("formula");
      expect(
        inferControl({ type: "number", "x-ui": { control: "formula" } }),
      ).toBe("formula");
    });

    test("should let an explicit control win over format", () => {
      expect(
        inferControl({
          type: "string",
          format: "email",
          "x-field-type": "textarea",
        }),
      ).toBe("textarea");
    });
  });

  describe("relations", () => {
    test("should resolve $ref to select", () => {
      expect(inferControl({ $ref: "schema://entity" })).toBe("select");
    });

    test("should resolve array-of-$ref to multiselect", () => {
      expect(
        inferControl({ type: "array", items: { $ref: "schema://contact" } }),
      ).toBe("multiselect");
    });

    test("should resolve x-relation namespace with multiple", () => {
      expect(
        inferControl({
          type: "string",
          "x-relation": { target: "contact", multiple: true },
        }),
      ).toBe("multiselect");
      expect(
        inferControl({ type: "string", "x-relation": { target: "contact" } }),
      ).toBe("select");
    });

    test("should let explicit multiple win over an array type", () => {
      // Legacy data: loan.assignee is array-typed but renders a single picker
      expect(
        inferControl({
          type: "array",
          "x-relation-target": "contact",
          "x-relation-multiple": false,
        }),
      ).toBe("select");
    });

    test("should resolve legacy flat x-relation-target", () => {
      expect(
        inferControl({ type: "array", "x-relation-target": "contact" }),
      ).toBe("multiselect");
      expect(
        inferControl({ type: "string", "x-relation-target": "contact" }),
      ).toBe("select");
    });
  });

  describe("format and type fallbacks", () => {
    test("should map string formats", () => {
      expect(inferControl({ type: "string", format: "date" })).toBe("date");
      expect(inferControl({ type: "string", format: "email" })).toBe("email");
      expect(inferControl({ type: "string", format: "phone" })).toBe("phone");
      expect(inferControl({ type: "string", format: "ein" })).toBe("ein");
      expect(inferControl({ type: "string", format: "us-state" })).toBe(
        "us-state",
      );
      expect(inferControl({ type: "string", format: "currency" })).toBe(
        "currency",
      );
      expect(inferControl({ type: "string", format: "percent" })).toBe(
        "percent",
      );
    });

    test("should fall back to text for unknown string formats", () => {
      expect(inferControl({ type: "string", format: "uuid" })).toBe("text");
      expect(inferControl({ type: "string" })).toBe("text");
    });

    test("should map primitive types", () => {
      expect(inferControl({ type: "number" })).toBe("number");
      expect(inferControl({ type: "integer" })).toBe("number");
      expect(inferControl({ type: "boolean" })).toBe("boolean");
    });

    test("should handle nullable union types", () => {
      expect(inferControl({ type: ["string", "null"] })).toBe("text");
      expect(inferControl({ type: ["number", "null"] })).toBe("number");
    });

    test("should map option-list arrays to multiselect", () => {
      expect(
        inferControl({
          type: "array",
          uniqueItems: true,
          items: { oneOf: [{ const: "a" }, { const: "b" }] },
        }),
      ).toBe("multiselect");
    });

    test("should map arrays of fixed-shape objects to object-array", () => {
      expect(
        inferControl({
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" } },
          },
        }),
      ).toBe("object-array");
    });
  });
});
