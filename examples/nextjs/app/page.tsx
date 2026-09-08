import Link from "next/link";
import { CodeExample } from "@/components/code-example";
import Image from "next/image";
import { CopyChip } from "@/components/copy-chip";
import { HeroDemo } from "@/components/hero-demo";

// Real facts only — each highlight is a claim the README makes.
const highlights = [
  {
    title: "zero runtime dependencies",
    body: "The core store depends on nothing and is DOM-free. React is an optional peer.",
  },
  {
    title: "bring your own components",
    body: "jsonisch ships no widgets. Register yours once, keyed by control kind — every schema a tenant can invent renders through that one registry.",
  },
  {
    title: "injected validation",
    body: "The validator interface is deliberately AJV-shaped: a compiled AJV validate function passes through unchanged.",
  },
  {
    title: "derived values by construction",
    body: "Formula fields evaluate through a calc engine you inject — and stay out of dirty-tracking and the submit payload by construction.",
  },
];

export default function Home() {
  return (
    <main>
      {/* Copy stays top-aligned: the right column is tall, and centering
          against it pushes the headline below a laptop fold. */}
      <section className="mx-auto grid max-w-6xl items-start gap-12 px-6 pt-14 pb-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-16">
        <div className="grid gap-6 lg:pt-10">
          <p className="text-muted-foreground font-mono text-sm">
            v0.1.1 · zero runtime dependencies · MIT
          </p>
          <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
            Schemas as{" "}
            <span className="font-mono font-medium whitespace-nowrap">
              <span className="text-brace-open glow-brace-open">{"{"}</span>{" "}
              values{" "}
              <span className="text-brace-close glow-brace-close">{"}"}</span>
            </span>
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
            {
              "Reactive forms derived from JSON-Schema that's runtime data — stored in your database, customized by your admins, or written by an LLM a second ago. Bring your own components."
            }
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/playground"
              className="glow-red bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-md px-6 text-sm font-medium transition-colors"
            >
              Open the playground
            </Link>
            <CopyChip text="pnpm add jsonisch" />
          </div>
        </div>
        <div className="grid justify-items-center gap-4">
          {/* logo-screen.png = the painted logo with blacks crushed to true
              zero (JPEG block noise lifts under screen blending); the plate
              vanishes into the dark page, glows add light as painted. */}
          <div className="relative">
            {/* The black-crush that kills JPEG blocks also ate the painted
                ambient halo — this radial puts it back behind him. */}
            <div
              aria-hidden="true"
              className="absolute inset-[-30%]"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(229,35,46,0.38), transparent 72%)",
              }}
            />
            <Image
              src="/logo-screen.png"
              alt="The jsonisch mascot: a red database record between a cyan open brace and a pink close brace"
              width={172}
              height={172}
              priority
              className="relative"
              style={{ mixBlendMode: "screen" }}
            />
          </div>
          <HeroDemo />
        </div>
      </section>

      <section className="border-border/60 border-t">
        <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((highlight) => (
            <div key={highlight.title} className="grid content-start gap-2">
              <h2 className="font-mono text-sm font-medium">
                {highlight.title}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {highlight.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border/60 border-t">
        <div className="mx-auto grid max-w-4xl gap-8 px-6 py-16">
          <div className="grid gap-2">
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
              quickstart
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">
              One registry. Every schema.
            </h2>
            <p className="text-muted-foreground max-w-2xl leading-relaxed">
              Write plain controlled widgets, register them once with a
              validator, and every form is two lines — no matter what schema
              shows up.
            </p>
          </div>
          <CodeExample />
          <Link
            href="/playground"
            className="text-brace-open justify-self-start font-mono text-sm hover:underline"
          >
            Try it in the playground →
          </Link>
        </div>
      </section>
    </main>
  );
}
