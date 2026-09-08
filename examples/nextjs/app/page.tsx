import { Playground } from "@/components/playground";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 grid gap-2">
        <p className="text-muted-foreground font-mono text-sm">jsonisch</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Schemas as values
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          The JSON-Schema on the left is runtime data — the kind that lives in
          a database row or arrives from an agent. The form on the right is
          derived from it: shadcn widgets dispatched by control kind, AJV
          validation on submit, and a derived field evaluated through a tiny
          calc engine this demo injects (jsonisch has no expression language
          of its own).
        </p>
      </header>
      <Playground />
    </main>
  );
}
