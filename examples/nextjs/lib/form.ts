"use client";

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { createFormHook } from "jsonisch/react";
import {
  BooleanWidget,
  CurrencyWidget,
  DateWidget,
  EmailWidget,
  FormulaWidget,
  NumberWidget,
  SelectWidget,
  TextWidget,
  TextareaWidget,
} from "@/components/widgets";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Registered ONCE at module level — every schema the editor can produce
// renders through this one registry. jsonisch never depends on AJV: the
// validator interface is AJV-shaped, so the compiled check passes through.
export const { useAppForm, Form, Field, Fields } = createFormHook({
  widgets: {
    text: TextWidget,
    textarea: TextareaWidget,
    email: EmailWidget,
    date: DateWidget,
    number: NumberWidget,
    currency: CurrencyWidget,
    select: SelectWidget,
    boolean: BooleanWidget,
    formula: FormulaWidget,
  },
  validate: (schema) => {
    try {
      const check = ajv.compile(schema);
      return (input) => (check(input) ? null : check.errors);
    } catch {
      // A schema AJV cannot compile still renders — it just validates
      // nothing. The editor is free-typed, so this must never throw.
      return () => null;
    }
  },
});
