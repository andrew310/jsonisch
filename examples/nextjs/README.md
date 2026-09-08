# jsonisch × Next.js × shadcn/ui

The example site for [jsonisch](https://github.com/andrew310/jsonisch)'s core
pitch: **schemas as values**. A JSON-Schema sits in a textarea as editable
JSON; the form next to it is derived live from whatever schema currently
parses — shadcn widgets dispatched by control kind, AJV validation wired
through `createFormHook`, and a derived field evaluated through a ~100-line
demo calc engine injected as a plugin (jsonisch has no expression language of
its own; the engine is always the host's).

## Run it

```sh
cd examples/nextjs
pnpm install
pnpm dev      # http://localhost:3000 — landing page; playground at /playground
```

`pnpm build` must pass; the app has no tests of its own.

## What to try

- Pick a preset (a creative agency's client onboarding, a wedding
  photographer's booking form, or a schema "an agent just wrote") — three
  unrelated businesses through the same widget registry — then edit the
  JSON: retitle a field, add a property, move a key into `required`,
  change an `enum`.
- Break the JSON mid-edit — the form keeps rendering the last schema that
  parsed, with a parse notice under the editor.
- Type into `budget` and watch `depositDue` recompute; submit and note the
  derived field is absent from the payload.
- Submit with a required field empty — AJV errors land under the fields.

## Local development against jsonisch source

This example depends on the **published** package (`jsonisch@^0.1.1` from
npm), so it exercises the real artifact. To develop against the repo's
source instead:

```sh
# from the repo root
pnpm build            # produce dist/
cd examples/nextjs
pnpm link ../..       # or: pnpm add link:../..
```

Undo with `pnpm add jsonisch@^0.1.1`.
