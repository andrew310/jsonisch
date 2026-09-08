import type { JsonSchema } from "jsonisch";

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly schema: JsonSchema;
}

// Three schemas-as-values, deliberately from unrelated businesses: the
// point of the preset select is the SAME widget registry rendering a
// totally different vertical in one click. In a real app these rows live
// in a database (or arrive from an agent); here they seed the editor.
export const presets: readonly Preset[] = [
  {
    id: "agency",
    label: "Client onboarding · creative agency",
    schema: {
      type: "object",
      title: "Client onboarding",
      description:
        "The intake form a creative agency tailors per engagement — no deploy between clients.",
      required: ["companyName", "contactEmail", "projectType"],
      properties: {
        companyName: { type: "string", title: "Company name" },
        contactEmail: {
          type: "string",
          format: "email",
          title: "Contact email",
        },
        projectType: {
          type: "string",
          title: "Project type",
          enum: ["brand identity", "website", "motion"],
          "x-ui": { control: "select" },
        },
        budget: {
          type: "number",
          title: "Budget",
          minimum: 1,
          "x-ui": { control: "currency" },
        },
        kickoffDate: {
          type: "string",
          format: "date",
          title: "Kickoff date",
        },
        referral: {
          type: "string",
          title: "Where did you hear about us?",
        },
        depositDue: {
          type: "number",
          title: "Deposit due (30%)",
          "x-ui": { control: "formula" },
          "x-formula": "budget * 0.3",
        },
      },
    },
  },
  {
    id: "photographer",
    label: "Booking form · wedding photographer",
    schema: {
      type: "object",
      title: "Wedding booking",
      description:
        "A different business entirely — rendered by the same widget registry.",
      required: ["coupleNames", "eventDate", "package"],
      properties: {
        coupleNames: { type: "string", title: "Couple's names" },
        venue: { type: "string", title: "Venue" },
        eventDate: {
          type: "string",
          format: "date",
          title: "Event date",
        },
        package: {
          type: "string",
          title: "Package",
          enum: ["elopement", "half-day", "full-day"],
          "x-ui": { control: "select" },
        },
        coverageHours: {
          type: "number",
          title: "Coverage hours",
          minimum: 1,
          maximum: 14,
        },
        hourlyRate: {
          type: "number",
          title: "Hourly rate",
          "x-ui": { control: "currency" },
        },
        secondShooter: { type: "boolean", title: "Second shooter" },
        estimatedTotal: {
          type: "number",
          title: "Estimated total",
          "x-ui": { control: "formula" },
          "x-formula": "coverageHours * hourlyRate",
        },
      },
    },
  },
  {
    id: "agent",
    label: "Agent output (seconds old)",
    schema: {
      type: "object",
      title: "Project brief intake",
      description:
        "An agent drafted this schema seconds after a sales call, to collect what it couldn't infer. The schema it wrote IS the form — and the same contract validates the reply.",
      required: ["projectName", "launchWindow"],
      properties: {
        projectName: { type: "string", title: "Project name" },
        launchWindow: {
          type: "string",
          title: "Launch window",
          enum: ["this quarter", "next quarter", "flexible"],
          "x-ui": { control: "select" },
        },
        successMetric: {
          type: "string",
          title: "What does success look like?",
        },
        outOfScope: {
          type: "string",
          title: "Anything explicitly out of scope?",
          "x-ui": { control: "textarea" },
        },
        hasExistingBrand: {
          type: "boolean",
          title: "Existing brand guidelines",
        },
      },
    },
  },
];
