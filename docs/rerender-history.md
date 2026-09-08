# A short history of the re-render problem

Where jsonisch's reactivity engine comes from. This is lineage, not pitch —
the re-render problem was solved by the signals generation (formisch and the
SolidJS school); jsonisch inherits that answer rather than contributing one.
It's recorded here because knowing which era a library belongs to tells you
most of what you need to know about it.

Every React form library is, underneath, an answer to one question: **when I
type one character into a 60-field form, what re-renders?** The history is
basically that answer getting better.

| Era | Library | How it held form state | What re-rendered on a keystroke |
|---|---|---|---|
| ~2016 | **Redux-Form** | in the Redux store | the whole form subtree, from the store — correct, and famously slow |
| ~2018 | **Formik** | one React state object at the top | all fields — the "everything re-renders" problem |
| ~2018 | **React Final Form** | an observable form-state object + **per-field subscriptions** | only the field you typed in — hand-rolled fine-grained reactivity |
| ~2019 | **react-hook-form** | **uncontrolled inputs + refs** (the DOM holds the value) | nothing, until you ask — fast by *dodging* React |
| ~2020 | **TanStack Form** | a framework-agnostic store + **selector subscriptions** | only the subscribed slice — plus deep type inference and a composition API |
| ~2024 | **Formisch** (and the SolidJS lineage) | **signals** | only the true dependents — reactivity at the *value* level, with computeds for free |

React Final Form and TanStack Form both reach for **subscriptions**; signals
are the same idea made automatic and general — read a value and you're
subscribed, write it and only the readers re-run.

## What's a signal, concretely?

A signal is a value that tracks who reads it, so it can notify exactly those
readers when it changes. The whole mechanism is small:

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

The trick is the global `currentListener`: while a computation runs, any
`signal.get()` it calls auto-subscribes it. No dependency arrays. A
**computed** (e.g. a derived field) is just an `effect` that reads some
signals and writes to its own. In React, a snapshot hook bridges the gap —
it registers a subscriber that re-renders the component and collects which
signals were read during render.

## What jsonisch takes from this

Signals as the reactivity engine (its own implementation, no external signal
lib), so a keystroke re-renders only the fields that depend on it, and
derived fields recompute automatically as computeds over the dependency
graph. That's the formisch inheritance; the rest of jsonisch — deriving the
whole form from a runtime schema value — is layered on top of it.
