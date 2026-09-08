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
import { Textarea } from "@/components/ui/textarea";
import { DemoForm } from "@/components/demo-form";
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
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>The schema — a value</CardTitle>
            {parseError ? (
              <Badge variant="destructive">invalid JSON</Badge>
            ) : (
              <Badge variant="secondary">applied</Badge>
            )}
          </div>
          <CardDescription>
            Edit it and watch the form rearrange. Add a property, change a
            title, move a field into <code>required</code>.
          </CardDescription>
          <Select value={presetId} onValueChange={selectPreset}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a preset" />
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
          <Textarea
            aria-label="Schema editor"
            spellCheck={false}
            className="min-h-[480px] resize-y font-mono text-xs leading-relaxed"
            value={text}
            onChange={(e) => applyText(e.target.value)}
          />
          {parseError ? (
            <p className="text-destructive text-sm">
              {parseError} — the form keeps showing the last schema that parsed.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
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
              <CardTitle>Submitted output</CardTitle>
              <CardDescription>
                What <code>onSubmit</code> received. Derived fields (the ones
                with an <code>x-formula</code>) are absent — computed values
                never enter the payload.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted overflow-x-auto rounded-md p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(submitted, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
