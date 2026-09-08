import type { JsonSchema } from "jsonisch";

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly schema: JsonSchema;
}

// Three schemas-as-values. In a real app these rows live in a database
// (or arrive from an agent); here they seed the editor.
export const presets: readonly Preset[] = [
  {
    id: "loan",
    label: "Bridge loan application",
    schema: {
      type: "object",
      title: "Bridge loan application",
      required: ["borrowerName", "loanType", "loanAmount"],
      properties: {
        borrowerName: { type: "string", title: "Borrower name" },
        borrowerEmail: {
          type: "string",
          format: "email",
          title: "Borrower email",
        },
        loanType: {
          type: "string",
          title: "Loan type",
          enum: ["bridge", "construction", "rental"],
          "x-ui": { control: "select" },
        },
        loanAmount: {
          type: "number",
          title: "Loan amount",
          minimum: 1,
          "x-ui": { control: "currency" },
        },
        interestRate: {
          type: "number",
          title: "Interest rate (%)",
          minimum: 0,
          maximum: 25,
        },
        closingDate: {
          type: "string",
          format: "date",
          title: "Target closing date",
        },
        firstTimeInvestor: {
          type: "boolean",
          title: "First-time investor",
        },
        monthlyPayment: {
          type: "number",
          title: "Monthly payment (interest-only)",
          "x-ui": { control: "formula" },
          "x-formula": "loanAmount * interestRate / 100 / 12",
        },
      },
    },
  },
  {
    id: "invoice",
    label: "Invoice line",
    schema: {
      type: "object",
      title: "Invoice line",
      required: ["customer", "description", "quantity", "unitPrice"],
      properties: {
        customer: { type: "string", title: "Customer" },
        description: { type: "string", title: "Description" },
        quantity: { type: "number", title: "Quantity", minimum: 1 },
        unitPrice: {
          type: "number",
          title: "Unit price",
          "x-ui": { control: "currency" },
        },
        taxRate: { type: "number", title: "Tax rate (%)", minimum: 0 },
        notes: {
          type: "string",
          title: "Notes",
          "x-ui": { control: "textarea" },
        },
        total: {
          type: "number",
          title: "Total",
          "x-ui": { control: "formula" },
          "x-formula": "quantity * unitPrice * (1 + taxRate / 100)",
        },
      },
    },
  },
  {
    id: "agent",
    label: "Agent output (seconds old)",
    schema: {
      type: "object",
      title: "Deployment approval",
      description:
        "Emitted by an agent that needs a human sign-off before shipping. The schema it wrote IS the form — and the same contract validates the reply.",
      required: ["approver", "environment"],
      properties: {
        approver: { type: "string", title: "Your name" },
        environment: {
          type: "string",
          title: "Environment",
          enum: ["staging", "production"],
          "x-ui": { control: "select" },
        },
        replicas: {
          type: "number",
          title: "Replicas",
          minimum: 1,
          maximum: 12,
        },
        skipCanary: { type: "boolean", title: "Skip canary stage" },
        reason: {
          type: "string",
          title: "Why is this safe to ship?",
          "x-ui": { control: "textarea" },
        },
      },
    },
  },
];
