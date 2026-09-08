import type { Metadata } from "next";
import { Playground } from "@/components/playground";

export const metadata: Metadata = {
  title: "playground — jsonisch",
  description:
    "Edit a JSON-Schema value, watch a live form derive from it: widgets by control kind, AJV validation, derived fields through an injected calc engine.",
};

export default function PlaygroundPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 grid gap-2">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
          playground
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Edit the schema. Watch the form.
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          The schema below is runtime data — the kind that lives in a database
          row or arrives from an agent. The form derives from it: widgets
          dispatched by control kind, AJV validation on submit, and a derived
          field evaluated through a tiny calc engine this demo injects
          (jsonisch has no expression language of its own).
        </p>
      </header>
      <Playground />
    </main>
  );
}
