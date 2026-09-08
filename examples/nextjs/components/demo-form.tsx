"use client";

import { Button } from "@/components/ui/button";
import { demoEngine } from "@/lib/calc-engine";
import { Fields, Form, useAppForm } from "@/lib/form";
import { derivation, envelopes, type JsonSchema } from "jsonisch";

// Plugin factories are safe at module level: all mutable state is created
// per form store inside each plugin's `build`. `derivation` declares
// `dependsOn: [envelopes]`, so order matters.
const plugins = [envelopes(), derivation(demoEngine)];

export function DemoForm({
  schema,
  onSubmit,
}: {
  readonly schema: JsonSchema;
  readonly onSubmit: (output: Record<string, unknown>) => void;
}) {
  // The whole demo is these two lines: a schema VALUE in, a wired form out.
  // The caller remounts this component (React `key`) when the schema value
  // changes — a form store derives from one schema for its lifetime.
  const form = useAppForm({ schema, plugins });
  return (
    <Form of={form} onSubmit={(output) => onSubmit(output)} className="grid gap-5">
      <Fields of={form} />
      <div>
        {/* The one Record Red action in this view (brand rule, issue #23). */}
        <Button type="submit" className="glow-red">
          Submit
        </Button>
      </div>
    </Form>
  );
}
