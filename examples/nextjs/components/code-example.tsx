import { codeToHtml } from "shiki";

// The one complete runnable example — lifted from the README Quickstart
// (widgets → createFormHook → useAppForm). Keep it in sync with README.md;
// the landing page must never show code the README doesn't teach.

const widgetsCode = `import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WidgetProps } from "jsonisch/react";

export function TextWidget({ field }: WidgetProps) {
  return (
    <div>
      <Label htmlFor={field.name}>{field.schema.title ?? field.name}</Label>
      <Input
        id={field.name}
        value={(field.input as string) ?? ""}
        onChange={(e) => field.onChange(e.target.value)}
        {...field.props}
      />
      {field.errors && <p className="text-sm text-destructive">{field.errors[0]}</p>}
    </div>
  );
}

export function CurrencyWidget({ field }: WidgetProps) {
  /* same shape: field.input in, field.onChange out */
}

export function SelectWidget({ field }: WidgetProps) {
  /* options come from field.schema.enum — the schema node rides along */
}`;

const formCode = `import Ajv from "ajv";
import { createFormHook } from "jsonisch/react";
import { CurrencyWidget, SelectWidget, TextWidget } from "./widgets";

const ajv = new Ajv({ allErrors: true, strict: false });

export const { useAppForm, Form, Field } = createFormHook({
  widgets: { text: TextWidget, currency: CurrencyWidget, select: SelectWidget },
  validate: (schema) => {
    const check = ajv.compile(schema);
    return (input) => (check(input) ? null : check.errors);
  },
});`;

const loanFormCode = `// Fetched from your database — a VALUE, not a type
const schema = {
  type: "object",
  required: ["borrowerName"],
  properties: {
    borrowerName: { type: "string", title: "Borrower name" },
    loanAmount: {
      type: "number",
      title: "Loan amount",
      "x-ui": { control: "currency" },
    },
    loanType: {
      type: "string",
      title: "Loan type",
      enum: ["bridge", "construction", "rental"],
      "x-ui": { control: "select" },
    },
  },
};

function LoanForm({ record }: { record: unknown }) {
  const form = useAppForm({ schema, initialInput: record });
  return <Form of={form} onSubmit={(output) => save(output)} />;
}`;

const files = [
  { name: "widgets.tsx", lang: "tsx", code: widgetsCode },
  { name: "form.ts", lang: "ts", code: formCode },
  { name: "loan-form.tsx", lang: "tsx", code: loanFormCode },
] as const;

// A minimal TextMate theme carrying the brand's code palette: strings
// pink, punctuation and braces cyan-leaning, keywords Signal.
const jsonischTheme = {
  name: "jsonisch",
  type: "dark" as const,
  colors: {
    "editor.background": "#101014",
    "editor.foreground": "#EDEDF2",
  },
  settings: [
    { settings: { foreground: "#EDEDF2", background: "#101014" } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#6E6E78", fontStyle: "italic" },
    },
    {
      scope: ["string", "punctuation.definition.string"],
      settings: { foreground: "#FF3D8F" },
    },
    {
      scope: ["punctuation", "meta.brace"],
      settings: { foreground: "#5FB8DC" },
    },
    {
      scope: ["keyword", "storage.type", "storage.modifier"],
      settings: { foreground: "#EDEDF2" },
    },
    { scope: ["constant.numeric"], settings: { foreground: "#45D4FF" } },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "entity.name.tag",
        "support.class.component",
      ],
      settings: { foreground: "#45D4FF" },
    },
    {
      scope: [
        "variable",
        "variable.other",
        "variable.parameter",
        "entity.other.attribute-name",
      ],
      settings: { foreground: "#C6C6CF" },
    },
    {
      scope: ["meta.object-literal.key", "support.type.property-name"],
      settings: { foreground: "#9A9AA3" },
    },
  ],
};

export async function CodeExample() {
  const rendered = await Promise.all(
    files.map((file) =>
      codeToHtml(file.code, { lang: file.lang, theme: jsonischTheme }),
    ),
  );
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border">
      {files.map((file, index) => (
        <section key={file.name}>
          <p
            className={`text-muted-foreground border-border/60 border-b px-5 py-2.5 font-mono text-xs ${
              index > 0 ? "border-t" : ""
            }`}
          >
            {file.name}
          </p>
          <div
            className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-relaxed [&_pre]:min-w-max"
            // Shiki output is generated at build time from the constants
            // above — no user input reaches this HTML.
            dangerouslySetInnerHTML={{ __html: rendered[index] }}
          />
        </section>
      ))}
    </div>
  );
}
