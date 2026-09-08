import type { Metadata } from "next";
import type { ReactNode } from "react";
import { codeToHtml } from "shiki";
import {
  apiReference,
  type ApiEntryPoint,
  type ApiExport,
} from "@/lib/api-reference";
import { jsonischTheme } from "@/lib/shiki-theme";

export const metadata: Metadata = {
  title: "api — jsonisch",
  description:
    "The whole public surface on one page: every export of jsonisch, jsonisch/plugin, and jsonisch/react with its signature and a one-line description.",
};

const entryPoints: ReadonlyArray<{ name: ApiEntryPoint; blurb: string }> = [
  {
    name: "jsonisch",
    blurb:
      "The app-facing form API: create a store from a schema, the verb methods, the save/load codec, widget-facing reads, and the first-party plugin factories.",
  },
  {
    name: "jsonisch/plugin",
    blurb:
      "Machinery for plugin authors and host adapters: the signal primitives, the plugin system, first-party slot keys, and internal-tree reads.",
  },
  {
    name: "jsonisch/react",
    blurb:
      "The React adapter: headless components, the widget-registry hook, and the reactive store snapshots widgets consume.",
  },
];

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface Group {
  readonly category: string;
  readonly rows: readonly ApiExport[];
}

function groupsOf(entry: ApiEntryPoint): Group[] {
  const groups: Group[] = [];
  for (const row of apiReference) {
    if (row.entry !== entry) continue;
    const last = groups[groups.length - 1];
    if (last?.category === row.category) {
      (last.rows as ApiExport[]).push(row);
    } else {
      groups.push({ category: row.category, rows: [row] });
    }
  }
  return groups;
}

// Descriptions carry markdown-style backtick spans; render them as code.
function inlineCode(text: string): ReactNode {
  const parts = text.split("`");
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="text-foreground/85 font-mono text-[0.85em]">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

// `type X` / `interface X` with no type params adds nothing beyond the
// name and kind chip, so those rows skip the signature block.
const isBareTypeSignature = (row: ApiExport) =>
  row.signature === `type ${row.name}` || row.signature === `interface ${row.name}`;

const chipLabel = (row: ApiExport) =>
  row.kind === "type" ? row.signature.split(" ")[0] : row.kind;

export default async function ApiPage() {
  const highlighted = new Map<string, string>();
  await Promise.all(
    apiReference.map(async (row) => {
      if (isBareTypeSignature(row)) return;
      const html = await codeToHtml(row.signature, {
        lang: "ts",
        theme: jsonischTheme,
        // The theme's editor background equals the card color; nudge it
        // darker so signature blocks read as wells inside their card.
        colorReplacements: { "#101014": "#0b0b0f" },
      });
      highlighted.set(`${row.entry}:${row.name}`, html);
    }),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-10 grid gap-2">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
          api · v0.1.1
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          The whole surface, one page.
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          Every export of the three entry points, with its signature and one
          line on what it does. Grouped exactly as the entry files group them
          — and a build-time tripwire diffs this page against the installed
          package, so it cannot drift.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {entryPoints.map(({ name, blurb }) => {
          const groups = groupsOf(name);
          return (
            <div
              key={name}
              className="border-border bg-card grid content-start gap-3 rounded-xl border p-5"
            >
              <a
                href={`#${slug(name)}`}
                className="hover:text-brace-open font-mono text-sm font-medium transition-colors"
              >
                {name}
              </a>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {blurb}
              </p>
              <ul className="mt-1 grid gap-1 font-mono text-xs">
                {groups.map((group) => (
                  <li key={group.category}>
                    <a
                      href={`#${slug(`${name} ${group.category}`)}`}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {group.category.toLowerCase()}
                      <span className="text-muted-foreground/60">
                        {" "}
                        · {group.rows.length}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {entryPoints.map(({ name, blurb }) => (
        <section
          key={name}
          id={slug(name)}
          className="border-border/60 mt-14 scroll-mt-20 border-t pt-10"
        >
          <h2 className="font-mono text-xl font-medium tracking-tight">
            <span className="text-brace-open">{"{"}</span> {name}{" "}
            <span className="text-brace-close">{"}"}</span>
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
            {blurb}
          </p>

          {groupsOf(name).map((group) => (
            <div
              key={group.category}
              id={slug(`${name} ${group.category}`)}
              className="border-border bg-card mt-8 scroll-mt-20 overflow-hidden rounded-xl border"
            >
              <p className="text-muted-foreground border-border/60 border-b px-5 py-2.5 font-mono text-xs">
                {group.category.toLowerCase()}
                <span className="text-muted-foreground/60">
                  {" "}
                  · {group.rows.length}
                </span>
              </p>
              <div className="divide-border/60 divide-y">
                {group.rows.map((row) => (
                  <div key={row.name} id={row.name} className="scroll-mt-20 px-5 py-4">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <a
                        href={`#${row.name}`}
                        className="hover:text-brace-open font-mono text-sm font-medium transition-colors"
                      >
                        {row.name}
                      </a>
                      <span className="text-muted-foreground/70 font-mono text-[10px] tracking-wider uppercase">
                        {chipLabel(row)}
                      </span>
                    </div>
                    {!isBareTypeSignature(row) && (
                      <div
                        className="mt-2 overflow-x-auto font-mono text-[13px] leading-relaxed [&_pre]:min-w-max [&_pre]:rounded-lg [&_pre]:px-4 [&_pre]:py-2.5"
                        // Shiki output is generated at build time from the
                        // checked-in signature strings — no user input
                        // reaches this HTML.
                        dangerouslySetInnerHTML={{
                          __html: highlighted.get(`${row.entry}:${row.name}`) ?? "",
                        }}
                      />
                    )}
                    <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-relaxed">
                      {inlineCode(row.description)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
