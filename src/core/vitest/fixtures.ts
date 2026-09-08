import type { JsonSchema } from "../types";

/**
 * Real-shaped fixtures so tests exercise our actual vocabulary, not toy
 * schemas.
 */

/**
 * A flat workflow-form-task schema: flat JSONB end-to-end, no `x-column`
 * routing, no relations — the v1 pilot surface.
 */
export const workflowFormSchema: JsonSchema = {
  type: "object",
  required: ["borrowerName", "loanPurpose"],
  properties: {
    borrowerName: { type: "string" },
    loanPurpose: {
      type: "string",
      enum: ["purchase", "refinance", "cash-out"],
      "x-ui": { control: "select" },
    },
    creditScore: { type: "number" },
    isEntity: { type: "boolean", "x-ui": { control: "boolean" } },
    closingDate: { type: "string", format: "date" },
    notes: { type: "string", "x-ui": { control: "textarea" } },
  },
};

/**
 * A loan-stage schema slice: `x-column` columns next to data-bag fields,
 * and estimate/amount-or-percent fields whose meta half rides INSIDE their
 * own data-bag entry (the kind-discriminated envelope).
 */
export const loanStageSchema: JsonSchema = {
  type: "object",
  required: ["loanAmount", "borrowerName"],
  properties: {
    // Real table columns
    loanAmount: {
      type: "number",
      "x-column": true,
      "x-ui": { control: "currency" },
    },
    borrowerName: { type: "string", "x-column": true },
    // Data-bag fields
    purchasePrice: { type: "number", "x-ui": { control: "currency" } },
    ltv: {
      type: "number",
      "x-ui": { control: "formula" },
      "x-formula": "loanAmount / purchasePrice",
    },
    originationFee: { type: "number", "x-ui": { control: "amount-or-percent" } },
    appraisedValue: {
      type: "number",
      "x-ui": { control: "estimate" },
      "x-formula": "purchasePrice * 1.1",
    },
    titleFee: { type: "number", "x-ui": { control: "line-item" } },
  },
};

/**
 * An array-of-objects (assets) schema — the repeating sub-form shape.
 */
export const assetsSchema: JsonSchema = {
  type: "object",
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "purchasePrice"],
        properties: {
          label: { type: "string" },
          purchasePrice: { type: "number", "x-ui": { control: "currency" } },
          appraisedAiv: { type: "number" },
        },
      },
    },
  },
};
