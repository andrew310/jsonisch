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
      "x-field-type": "select",
    },
    creditScore: { type: "number" },
    isEntity: { type: "boolean", "x-field-type": "checkbox" },
    closingDate: { type: "string", format: "date" },
    notes: { type: "string", "x-field-type": "textarea" },
  },
};

/**
 * A loan-stage schema slice: `x-column` columns next to data-bag fields,
 * legacy `x-field-type` values (translated to the settled vocabulary at
 * read time), and estimate/amount-or-percent fields whose meta half rides
 * INSIDE their own data-bag entry (the LOS-573 envelope,
 * `{ value, source | entry }`).
 */
export const loanStageSchema: JsonSchema = {
  type: "object",
  required: ["loanAmount", "borrowerName"],
  properties: {
    // Real table columns
    loanAmount: {
      type: "number",
      "x-column": true,
      "x-field-type": "currency",
    },
    borrowerName: { type: "string", "x-column": true },
    // Data-bag fields
    purchasePrice: { type: "number", "x-field-type": "currency" },
    ltv: {
      type: "number",
      "x-field-type": "calculated",
      "x-formula": "loanAmount / purchasePrice",
    },
    originationFee: { type: "number", "x-field-type": "hybrid" },
    appraisedValue: {
      type: "number",
      "x-field-type": "computed",
      "x-formula": "purchasePrice * 1.1",
    },
    titleFee: { type: "number", "x-field-type": "ledger" },
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
          purchasePrice: { type: "number", "x-field-type": "currency" },
          appraisedAiv: { type: "number" },
        },
      },
    },
  },
};
