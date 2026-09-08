import { describe, expect, test } from "vitest";
import { inferControl } from "../control";

describe("inferControl", () => {
  describe("explicit x-ui.control", () => {
    test("should read the derived-field kinds", () => {
      expect(
        inferControl({ type: "number", "x-ui": { control: "formula" } }),
      ).toBe("formula");
      expect(
        inferControl({ type: "number", "x-ui": { control: "estimate" } }),
      ).toBe("estimate");
      expect(
        inferControl({
          type: "number",
          "x-ui": { control: "amount-or-percent" },
        }),
      ).toBe("amount-or-percent");
      expect(
        inferControl({ type: "number", "x-ui": { control: "line-item" } }),
      ).toBe("line-item");
    });

    test("should fall through to inference on an unknown control name", () => {
      expect(
        inferControl({ type: "number", "x-ui": { control: "calculated" } }),
      ).toBe("number");
      expect(
        inferControl({ type: "string", "x-field-type": "textarea" }),
      ).toBe("text");
    });

    test("should promote a formula with estimate: true to estimate", () => {
      expect(
        inferControl({
          type: "number",
          "x-ui": { control: "formula" },
          estimate: true,
        }),
      ).toBe("estimate");
    });

    test("should let an explicit control win over format", () => {
      expect(
        inferControl({
          type: "string",
          format: "email",
          "x-ui": { control: "textarea" },
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

    test("should resolve flat vendor x-relation-target", () => {
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
