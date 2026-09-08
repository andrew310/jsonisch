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
  required: ["projectType"],
  properties: {
    projectType: {
      type: "string",
      title: "Project type",
      enum: ["brand identity", "website", "motion"],
      "x-ui": { control: "select" },
    },
    budget: {
      type: "number",
      title: "Budget",
      "x-ui": { control: "currency" },
    },
    depositDue: {
      type: "number",
      title: "Deposit due (30%)",
      "x-ui": { control: "formula" },
      "x-formula": "budget * 0.3",
    },
  },
};

export function HeroDemo() {
  const form = useAppForm({
    schema: heroSchema,
    plugins,
    initialInput: { projectType: "brand identity", budget: 18000 },
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
