# @rwa/jsonisch

> Schema in, reactive form out. A form library that **derives forms from JSON-Schema** — state, validation, derivation, dirty-tracking, and reconcile — driven by the schema itself, not a validation-library type.

**Status: experimental.** v1a (core store) and v1b (React adapter + registry + AJV routing) are built and piloting on a single real surface. Not yet stable, not yet published.

---

## The one-line pitch

Most form libraries make you hand-write a component per field and wire up state, validation, and derived values yourself. `jsonisch` takes a **JSON-Schema** — the kind you already store in a database — walks it once, and gives you a fully reactive, validated form with the fields already wired. You bring the widgets; it brings everything else.

```tsx
// register your widgets once
export const { useAppForm, Form, Field } = createFormHook({
  widgets: { text: TextWidget, currency: CurrencyWidget, select: SelectWidget /* … */ },
  validate: ajvValidator,
});

// a whole form, rolled from the schema — no hand-written fields
const form = useAppForm({ schema, initialInput: record });
return <Form of={form} onSubmit={save} />;
```

---

## Why another form library? A short history of the re-render problem

Every React form library is, underneath, an answer to one question: **when I type one character into a 60-field form, what re-renders?** The history is basically that answer getting better.

| Era | Library | How it held form state | What re-rendered on a keystroke |
|---|---|---|---|
| ~2016 | **Redux-Form** | in the Redux store | the whole form subtree, from the store — correct, and famously slow |
| ~2018 | **Formik** | one React state object at the top | all fields — the "everything re-renders" problem |
| ~2018 | **React Final Form** | an observable form-state object + **per-field subscriptions** | only the field you typed in — hand-rolled fine-grained reactivity |
| ~2019 | **react-hook-form** | **uncontrolled inputs + refs** (the DOM holds the value) | nothing, until you ask — fast by *dodging* React |
| ~2020 | **TanStack Form** | a framework-agnostic store + **selector subscriptions** | only the subscribed slice — plus deep type inference and a composition API |
| ~2024 | **Formisch** (and the SolidJS lineage) | **signals** | only the true dependents — reactivity at the *value* level, with computeds for free |

React Final Form and TanStack Form both reach for **subscriptions**; signals are the same idea made automatic and general — read a value and you're subscribed, write it and only the readers re-run.

### What's a signal, concretely?

A signal is a value that tracks who reads it, so it can notify exactly those readers when it changes. The whole mechanism is small:

```js
let currentListener = null;                 // "who's reading right now?"

function signal(value) {
  const subs = new Set();
  return {
    get() { if (currentListener) subs.add(currentListener); return value; }, // read = subscribe
    set(next) { value = next; subs.forEach((fn) => fn()); },                 // write = notify
  };
}

function effect(fn) {                        // re-runs when any signal it read changes
  const run = () => { currentListener = run; fn(); currentListener = null; };
  run();
}
```

The trick is the global `currentListener`: while a computation runs, any `signal.get()` it calls auto-subscribes it. No dependency arrays. A **computed** (e.g. a formula field) is just an `effect` that reads some signals and writes to its own. In React, a `useSignals()` hook bridges the gap — it registers a subscriber that re-renders the component and collects which signals were read during render.

---

## Where jsonisch sits — a deliberate "best of three"

`jsonisch` is a synthesis of three lineages, picking one idea from each:

- **From TanStack Form** — the **framework-agnostic core + thin adapters** layout, and the **`createFormHook({ widgets })` composition/registry** pattern: register your design-system widgets once, get a typed `useAppForm` with them baked in.
- **From Formisch** — **signals** as the reactivity engine (its own, no external signal lib), so a keystroke re-renders only the fields that depend on it, and formula/derived fields recompute automatically.
- **New here** — the schema kind is **JSON-Schema**, not Zod/Valibot/Yup. Validation runs through **AJV**. Derived values are computed signals over the formulas already declared in the schema, so they're excluded from dirty-tracking and the submit payload *by construction*.

### Design stance on types

TanStack Form's headline is deep, compile-time **path type-inference**. `jsonisch` deliberately **drops it** — our schemas are runtime database data, so field paths are runtime values with no compile-time shape to infer against. The bet: keep *enough* typing that `tsc` stays a cheap, deterministic tripwire on the code (still very much worth it), but skip the galaxy-brain generics, and lean on **AJV + tests** for the runtime-shape correctness that types can't cover for a schema that only exists at runtime anyway.

---

## Architecture (mirrors formisch's shape)

- **core** — framework-agnostic store. `createFormStore(config, deps)` walks the JSON-Schema once and builds a field-store tree (`kind: array | object | value`), each node carrying signals (`input`/`initialInput` for dirty-vs-reset, `errors`, `isDirty`, DOM `elements`). DOM-free and isomorphic — the same walk runs server-side.
- **methods** — tree-shakeable ops: `setInput`, `validate`, `reset`, `insert/move/remove/swap`, `handleSubmit`, `pickDirty`, `applyBaseline`.
- **react** — `createFormHook`, `useAppForm`, `<Form>`, headless `<Field>`.

Deeper dives, with diagrams, live in [`docs/`](./docs):

- [decode-fork.md](./docs/decode-fork.md) — how a server record becomes `initialInput` (`x-column` routing, the envelope twin).
- [plugin-lifecycle.md](./docs/plugin-lifecycle.md) — the pass order at build, and the reseed / rebase / reset / transfer sites.
- [wire-shapes.md](./docs/wire-shapes.md) — the save payload partition, the persisted envelopes, and the LOS-461 skip policy.

---

## License / status

Internal to the RWA platform for now; may be extracted and open-sourced. Nothing here is API-stable yet.
