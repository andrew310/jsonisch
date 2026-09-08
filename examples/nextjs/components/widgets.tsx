"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { WidgetProps } from "jsonisch/react";

// Every widget is a plain controlled component in the README Quickstart's
// shape: render `field.input`, call `field.onChange`, spread `field.props`
// onto the DOM element (focus-on-error + touch/blur validation), and read
// titles/options off `field.schema` — the schema node rides along.

function FieldErrors({ field }: WidgetProps) {
  return field.errors ? (
    <p className="text-sm text-destructive">{field.errors[0]}</p>
  ) : null;
}

function fieldTitle(field: WidgetProps["field"]): string {
  return typeof field.schema.title === "string" ? field.schema.title : field.name;
}

export function TextWidget({ field, form }: WidgetProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
      <Input
        id={field.name}
        value={(field.input as string) ?? ""}
        onChange={(e) => field.onChange(e.target.value)}
        {...field.props}
      />
      <FieldErrors field={field} form={form} />
    </div>
  );
}

export function TextareaWidget({ field, form }: WidgetProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
      <Textarea
        id={field.name}
        value={(field.input as string) ?? ""}
        onChange={(e) => field.onChange(e.target.value)}
        {...field.props}
      />
      <FieldErrors field={field} form={form} />
    </div>
  );
}

export function EmailWidget({ field, form }: WidgetProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
      <Input
        id={field.name}
        type="email"
        value={(field.input as string) ?? ""}
        onChange={(e) => field.onChange(e.target.value)}
        {...field.props}
      />
      <FieldErrors field={field} form={form} />
    </div>
  );
}

export function DateWidget({ field, form }: WidgetProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
      <Input
        id={field.name}
        type="date"
        value={(field.input as string) ?? ""}
        onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
        {...field.props}
      />
      <FieldErrors field={field} form={form} />
    </div>
  );
}

export function NumberWidget({ field, form }: WidgetProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
      <Input
        id={field.name}
        type="number"
        value={typeof field.input === "number" ? field.input : ""}
        onChange={(e) =>
          field.onChange(
            e.target.value === "" || Number.isNaN(e.target.valueAsNumber)
              ? undefined
              : e.target.valueAsNumber,
          )
        }
        {...field.props}
      />
      <FieldErrors field={field} form={form} />
    </div>
  );
}

export function CurrencyWidget({ field, form }: WidgetProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
      <div className="relative">
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
          $
        </span>
        <Input
          id={field.name}
          inputMode="decimal"
          className="pl-7"
          value={typeof field.input === "number" ? field.input : ""}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, "");
            field.onChange(raw === "" ? undefined : Number(raw));
          }}
          {...field.props}
        />
      </div>
      <FieldErrors field={field} form={form} />
    </div>
  );
}

export function SelectWidget({ field, form }: WidgetProps) {
  // Options come from `field.schema.enum` — the schema node rides along.
  const options = (field.schema.enum ?? []).filter(
    (option): option is string => typeof option === "string",
  );
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
      <Select
        value={(field.input as string) ?? ""}
        onValueChange={(value) => field.onChange(value)}
      >
        <SelectTrigger id={field.name} className="w-full">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldErrors field={field} form={form} />
    </div>
  );
}

export function BooleanWidget({ field, form }: WidgetProps) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Checkbox
          id={field.name}
          checked={field.input === true}
          onCheckedChange={(checked) => field.onChange(checked === true)}
        />
        <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
      </div>
      <FieldErrors field={field} form={form} />
    </div>
  );
}

export function FormulaWidget({ field, form }: WidgetProps) {
  // `field.derived` is the derivation plugin's output: `{ value, error }`,
  // recomputed reactively as the fields the formula reads change. The value
  // never enters the submit payload — derived, not entered.
  const derived = field.derived;
  const formula = field.schema["x-formula"];
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={field.name}>{fieldTitle(field)}</Label>
        <Badge variant="secondary">derived</Badge>
      </div>
      <Input
        id={field.name}
        readOnly
        tabIndex={-1}
        className="bg-muted/50"
        value={
          typeof derived?.value === "number"
            ? derived.value.toLocaleString("en-US", { maximumFractionDigits: 2 })
            : ""
        }
      />
      {typeof formula === "string" ? (
        <p className="text-muted-foreground font-mono text-xs">= {formula}</p>
      ) : null}
      <FieldErrors field={field} form={form} />
    </div>
  );
}
