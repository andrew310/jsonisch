<p align="center">
  <img src="https://raw.githubusercontent.com/andrew310/jsonisch/main/assets/logo.jpg" width="220" alt="jsonisch — a database record between braces" />
</p>

# jsonisch

> Schemas as values. A form library for apps where JSON-Schemas are **runtime
> data** — stored in a database, customized by admins, composed on the fly —
> and the whole form is derived from the schema value: state, validation,
> derived values, visibility, dirty-tracking.

**Status: experimental.** The API is in production in one app. It is not frozen.

```sh
pnpm add jsonisch
# npm install jsonisch
# yarn add jsonisch
```

```ts
import { createFormStore } from "jsonisch";
import { createFormHook } from "jsonisch/react";
```

React is an optional peer. The core store is DOM-free.

---

## The problem: schemas as values

Most form libraries assume the shape of your form is known at build time —
a Zod schema in a module, types inferred from it, a hand-written component
per field. That assumption breaks the moment your app lets users customize
their forms: now the schema is a **value**, fetched from a database at
request time, different per tenant, edited without a deploy — or written
by an LLM a second ago. There is no compile-time type to infer against,
and nobody is hand-writing a component per field for a form that didn't
exist yesterday.

`jsonisch` starts from that world. It takes a JSON-Schema value, walks it
once, and gives you a fully reactive, validated form with the fields already
wired:

- **Validation** through an injected validator — the interface is
  deliberately AJV-shaped, so a compiled AJV validate function passes
  through unchanged (a first-party validation library may follow).
- **Rendering** through YOUR components — shadcn, your design system,
  anything. You register widgets once, keyed by control kind; every schema
  a tenant can invent renders through that one registry.
- **Derived values** through an injected calc engine that owns the
  expression language; jsonisch owns the scope construction and the
  derivation wiring (dependency graph, computed signals, exclusion from
  dirty-tracking and the submit payload *by construction*).
- **Dirty-tracking, visibility, reset, submit** — driven by the schema
  walk, not by per-field wiring.

You bring the components; it brings everything else.

That last part matters more in the age of agents. The cheapest thing a
model can produce is a JSON value — and a JSON-Schema value is a complete
form definition. An agent that needs structured input from a human can
emit a schema and have a validated, fully wired form on screen in the
same request: no codegen, no deploy, and the schema it wrote is the same
contract that validates what the human sends back.

---

## Quickstart

Write your widgets as plain controlled components — here with shadcn:

```tsx
// widgets.tsx
import { Input } from "@/components/ui/input";
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
}
```

Register them once, with a validator, at module level:

```ts
// form.ts
import Ajv from "ajv";
import { createFormHook } from "jsonisch/react";
import { CurrencyWidget, SelectWidget, TextWidget } from "./widgets";

const ajv = new Ajv({ allErrors: true, strict: false });

export const { useAppForm, Form, Field } = createFormHook({
  widgets: { text: TextWidget, currency: CurrencyWidget, select: SelectWidget },
  validate: (schema) => {
    const check = ajv.compile(schema);
    return (input) => (check(input) ? null : check.errors);
  },
});
```

Then every form is two lines, no matter what schema shows up:

```tsx
// Fetched from your database — a VALUE, not a type
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
}
```

`<Form>` without children renders the whole form from the schema through the
widget registry — no hand-written field components. `onSubmit` receives the
validated output; an invalid submit blocks the handler and focuses the first
erroring field. For custom layouts, `<Field of={form} path={["loanAmount"]} />`
places one registry-dispatched field, and a render-function child makes it
headless.

Widgets resolve by **control kind** — an explicit `x-ui.control` on the
schema node, or inferred from `format`/`type` (`inferControl` is exported).
A kind without a registry entry renders a visible fallback naming the
missing kind, so a schema misconfiguration can't silently drop a field.

Derived fields declare a formula on the schema node (`x-formula`), and the
form evaluates them reactively through a `CalcEngine` you inject as a
plugin — parse, evaluate, extract dependencies. The engine owns the
expression language; jsonisch builds the eval scopes (including the
root-record alias — `rootRecordAlias`, default `"record"` — the key stored
formulas use to address the root record) and wires the dependency graph.

---

## Where jsonisch sits

Two libraries are real lineage — we read their source and took ideas from
each deliberately:

- **TanStack Form** — the **framework-agnostic core + thin adapters**
  layout, and the **`createFormHook({ widgets })` composition/registry**
  pattern: register your design-system widgets once, get a typed
  `useAppForm` with them baked in.
- **Formisch** — the **signal** reactivity model jsonisch's store is built
  on (its own tiny signal implementation, no external lib): a keystroke
  re-renders only the fields that depend on it.

One more deserves naming: **react-jsonschema-form** has been rendering
forms from JSON-Schema since long before us. jsonisch is not derived from
it — candidly, we didn't study it — the resemblance comes from sharing a
premise, not code. What's visibly different from here: jsonisch is
signal-reactive, ships no components of its own (your design system,
dispatched by control kind), injects validation instead of bundling it,
and evaluates schema-declared formulas as computed signals — **derived
values**, excluded from dirty-tracking and the submit payload *by
construction*. A careful comparison would make a good doc; we haven't
written it.

The re-render question — "when I type one character into a 60-field form,
what re-renders?" — has a two-decade history that signals largely closed,
and jsonisch inherits that answer from the formisch lineage rather than
contributing one. The full story, table and all, lives in
[docs/rerender-history.md](https://github.com/andrew310/jsonisch/blob/main/docs/rerender-history.md).

### Design stance on types

TanStack Form's headline is deep, compile-time **path type-inference**.
`jsonisch` deliberately **drops it** — our schemas are runtime database
data, so field paths are runtime values with no compile-time shape to infer
against. The bet: keep *enough* typing that `tsc` stays a cheap,
deterministic tripwire on the code (still very much worth it), but skip the
galaxy-brain generics, and lean on **AJV + tests** for the runtime-shape
correctness that types can't cover for a schema that only exists at runtime
anyway.

---

## Architecture

- **core** — framework-agnostic store. `createFormStore(config, deps)` walks
  the JSON-Schema once and builds a field-store tree
  (`kind: array | object | value`), each node carrying signals
  (`input`/`initialInput` for dirty-vs-reset, `errors`, `isDirty`, DOM
  `elements`). DOM-free and isomorphic — the same walk runs server-side.
- **methods** — tree-shakeable ops: `setInput`, `validate`, `reset`,
  `insert/move/remove/swap`, `handleSubmit`, `pickDirty`, `applyBaseline`.
- **react** — `createFormHook`, `useAppForm`, `<Form>`, headless `<Field>`.

Deeper dives, with diagrams, live in
[`docs/`](https://github.com/andrew310/jsonisch/tree/main/docs):

- [rerender-history.md](https://github.com/andrew310/jsonisch/blob/main/docs/rerender-history.md) — a short history of the form re-render problem, and what a signal is, concretely.
- [decode-fork.md](https://github.com/andrew310/jsonisch/blob/main/docs/decode-fork.md) — how a server record becomes `initialInput` (`x-column` routing, the envelope twin).
- [plugin-lifecycle.md](https://github.com/andrew310/jsonisch/blob/main/docs/plugin-lifecycle.md) — the pass order at build, and the reseed / rebase / reset / transfer sites.
- [wire-shapes.md](https://github.com/andrew310/jsonisch/blob/main/docs/wire-shapes.md) — the save payload partition, the persisted envelopes, and the LOS-461 skip policy.

---

## License / status

MIT. Nothing here is API-stable yet.
