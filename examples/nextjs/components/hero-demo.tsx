"use client";

import { JsonPretty } from "@/components/json-pretty";
import { demoEngine } from "@/lib/calc-engine";
import { Fields, Form, useAppForm } from "@/lib/form";
import { derivation, envelopes, type JsonSchema } from "jsonisch";

const plugins = [envelopes(), derivation(demoEngine)];

// The hero visual is the library running, not a screenshot: this schema
// VALUE powers the form below it through the same registry the playground
// uses. Type in the form — the derived field recomputes.
const heroSchema: JsonSchema = {
  type: "object",
  required: ["loanAmount"],
  properties: {
    loanAmount: {
      type: "number",
      title: "Loan amount",
      "x-ui": { control: "currency" },
    },
    interestRate: { type: "number", title: "Interest rate (%)" },
    monthlyPayment: {
      type: "number",
      title: "Monthly payment",
      "x-ui": { control: "formula" },
      "x-formula": "loanAmount * interestRate / 100 / 12",
    },
  },
};

export function HeroDemo() {
  const form = useAppForm({
    schema: heroSchema,
    plugins,
    initialInput: { loanAmount: 250000, interestRate: 9.5 },
  });
  return (
    <div className="border-border bg-card w-full overflow-hidden rounded-xl border">
      <div className="border-border/60 border-b px-5 py-4">
        <p className="text-muted-foreground mb-3 font-mono text-xs tracking-widest uppercase">
          the schema — runtime data
        </p>
        <JsonPretty
          value={heroSchema}
          className="text-[11px] leading-relaxed"
        />
      </div>
      <div className="px-5 py-4">
        <p className="text-muted-foreground mb-4 font-mono text-xs tracking-widest uppercase">
          the form — derived. type in it.
        </p>
        {/* No submit button here: the landing page's one Record Red action
            is the hero CTA. Enter-to-submit hits a noop. */}
        <Form of={form} onSubmit={() => {}} className="grid gap-4">
          <Fields of={form} />
        </Form>
      </div>
    </div>
  );
}
