"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchemaEditor } from "@/components/schema-editor";
import { DemoForm } from "@/components/demo-form";
import { JsonPretty } from "@/components/json-pretty";
import { presets } from "@/lib/presets";
import type { JsonSchema } from "jsonisch";

interface AppliedSchema {
  readonly schema: JsonSchema;
  readonly version: number;
}

const pretty = (schema: JsonSchema) => JSON.stringify(schema, null, 2);

export function Playground() {
  const [presetId, setPresetId] = useState(presets[0].id);
  const [text, setText] = useState(pretty(presets[0].schema));
  const [applied, setApplied] = useState<AppliedSchema>({
    schema: presets[0].schema,
    version: 0,
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  // Malformed JSON never reaches the form: the last schema that parsed
  // keeps rendering, and the editor shows the parse error instead.
  const applyText = (value: string) => {
    setText(value);
    try {
      const schema = JSON.parse(value) as JsonSchema;
      setApplied((previous) => ({ schema, version: previous.version + 1 }));
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error));
    }
  };

  const selectPreset = (id: string) => {
    const preset = presets.find((entry) => entry.id === id);
    if (!preset) return;
    setPresetId(id);
    setText(pretty(preset.schema));
    setApplied((previous) => ({ schema: preset.schema, version: previous.version + 1 }));
    setParseError(null);
    setSubmitted(null);
  };

  const title =
    typeof applied.schema.title === "string" ? applied.schema.title : "Form";
  const description =
    typeof applied.schema.description === "string"
      ? applied.schema.description
      : "Rendered live from the schema on the left.";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card className="shadow-[0_0_40px_rgba(69,212,255,0.10)]">
        <CardHeader>
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
            the schema — runtime data
          </p>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>A value, not a type</CardTitle>
            {/* Invalid is Close Brace pink (--destructive), never red —
                Record Red belongs to the one primary action. */}
            {parseError ? (
              <Badge variant="destructive" className="font-mono">
                invalid JSON
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-brace-open/40 bg-brace-open/10 text-brace-open font-mono"
              >
                applied
              </Badge>
            )}
          </div>
          <CardDescription>
            Edit it and watch the form rearrange. Add a property, change a
            title, move a field into <code>required</code>.
          </CardDescription>
          {/* The preset switch is the demo: one registry, three unrelated
              businesses. */}
          <p className="text-muted-foreground pt-1 font-mono text-xs">
            whose form is this?
          </p>
          <Select value={presetId} onValueChange={selectPreset}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a business" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="grid gap-2">
          <SchemaEditor
            label="Schema editor"
            value={text}
            onChange={applyText}
          />
          {parseError ? (
            <p className="text-destructive text-sm">
              {parseError} — the form keeps showing the last schema that parsed.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="shadow-[0_0_48px_rgba(255,61,143,0.12)]">
          <CardHeader>
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
              the form — derived
            </p>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <DemoForm
              key={applied.version}
              schema={applied.schema}
              onSubmit={setSubmitted}
            />
          </CardContent>
        </Card>

        {submitted ? (
          <Card>
            <CardHeader>
              <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
                submitted output
              </p>
              <CardTitle>What onSubmit received</CardTitle>
              <CardDescription>
                Derived fields (the ones with an <code>x-formula</code>) are
                absent — computed values never enter the payload.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JsonPretty
                value={submitted}
                className="bg-background/60 rounded-md p-4 text-xs leading-relaxed"
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
