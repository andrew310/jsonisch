"use client";

import { useRef, type ReactNode } from "react";

// Brand rule (issue #23): cyan always opens, pink always closes — never
// swapped. The editor highlights WHATEVER is typed, valid JSON or not, so
// this tokenizes raw text; JsonPretty owns the parsed-value side.
const TOKEN =
  /"(?:[^"\\\n]|\\.)*"?(\s*:)?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{[]|[}\]]|\btrue\b|\bfalse\b|\bnull\b/g;

function tokenClass(token: string, isKey: boolean): string {
  const head = token[0];
  if (head === '"') return isKey ? "text-foreground/80" : "text-brace-close";
  if (head === "{" || head === "[") return "text-brace-open";
  if (head === "}" || head === "]") return "text-brace-close";
  if (token === "true" || token === "false" || token === "null") {
    return "text-foreground";
  }
  return "text-brace-open"; // number
}

function highlight(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m !== null; m = TOKEN.exec(text)) {
    if (m.index > last) {
      nodes.push(
        <span key={key++} className="text-muted-foreground">
          {text.slice(last, m.index)}
        </span>,
      );
    }
    const token = m[0];
    // A string token that consumed a trailing colon is a KEY: split so the
    // colon stays punctuation-muted.
    const colon = m[1];
    const body = colon ? token.slice(0, -colon.length) : token;
    nodes.push(
      <span key={key++} className={tokenClass(body, Boolean(colon))}>
        {body}
      </span>,
    );
    if (colon) {
      nodes.push(
        <span key={key++} className="text-muted-foreground">
          {colon}
        </span>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) {
    nodes.push(
      <span key={key++} className="text-muted-foreground">
        {text.slice(last)}
      </span>,
    );
  }
  return nodes;
}

// Overlay editor: a highlighted <pre> behind a transparent-text <textarea>.
// Both layers MUST share font, size, leading, padding, and wrapping, or the
// caret drifts off the glyphs it edits.
const SHARED =
  "px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words";

export function SchemaEditor({
  value,
  onChange,
  label,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly label: string;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  return (
    <div className="border-input bg-background/60 focus-within:ring-ring/50 relative min-h-[480px] rounded-md border focus-within:ring-[3px]">
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`${SHARED} pointer-events-none absolute inset-0 m-0 overflow-hidden`}
      >
        {highlight(value)}
        {"\n"}
      </pre>
      <textarea
        aria-label={label}
        spellCheck={false}
        className={`${SHARED} caret-foreground absolute inset-0 h-full w-full resize-none bg-transparent text-transparent outline-none`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          const pre = preRef.current;
          if (pre) {
            pre.scrollTop = e.currentTarget.scrollTop;
            pre.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
      />
    </div>
  );
}
