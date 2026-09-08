import type { ReactNode } from "react";

// Brand rule (issue #23): cyan always opens, pink always closes — brace
// glyphs never swap colors. This renderer walks the value instead of
// regexing serialized text so the rule can't misfire on string contents.

const INDENT = "  ";

function scalar(value: unknown): ReactNode {
  if (typeof value === "string") {
    return <span className="text-brace-close">&quot;{value}&quot;</span>;
  }
  if (typeof value === "number") {
    return <span className="text-brace-open">{String(value)}</span>;
  }
  return <span>{String(value)}</span>;
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== "object";
}

function Node({
  value,
  depth,
  label,
  comma,
}: {
  readonly value: unknown;
  readonly depth: number;
  readonly label?: string;
  readonly comma?: boolean;
}) {
  const pad = INDENT.repeat(depth);
  const labelNode =
    label === undefined ? null : (
      <>
        <span className="text-muted-foreground">&quot;{label}&quot;: </span>
      </>
    );
  const tail = comma ? <span className="text-muted-foreground">,</span> : null;

  if (Array.isArray(value)) {
    if (value.every(isScalar)) {
      return (
        <div>
          {pad}
          {labelNode}
          <span className="text-brace-open">[</span>
          {value.map((entry, index) => (
            <span key={index}>
              {scalar(entry)}
              {index < value.length - 1 ? (
                <span className="text-muted-foreground">, </span>
              ) : null}
            </span>
          ))}
          <span className="text-brace-close">]</span>
          {tail}
        </div>
      );
    }
    return (
      <>
        <div>
          {pad}
          {labelNode}
          <span className="text-brace-open">[</span>
        </div>
        {value.map((entry, index) => (
          <Node
            key={index}
            value={entry}
            depth={depth + 1}
            comma={index < value.length - 1}
          />
        ))}
        <div>
          {pad}
          <span className="text-brace-close">]</span>
          {tail}
        </div>
      </>
    );
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <>
        <div>
          {pad}
          {labelNode}
          <span className="text-brace-open">{"{"}</span>
        </div>
        {entries.map(([key, entry], index) => (
          <Node
            key={key}
            value={entry}
            depth={depth + 1}
            label={key}
            comma={index < entries.length - 1}
          />
        ))}
        <div>
          {pad}
          <span className="text-brace-close">{"}"}</span>
          {tail}
        </div>
      </>
    );
  }

  return (
    <div>
      {pad}
      {labelNode}
      {scalar(value)}
      {tail}
    </div>
  );
}

export function JsonPretty({
  value,
  className,
}: {
  readonly value: unknown;
  readonly className?: string;
}) {
  return (
    <pre className={`overflow-x-auto font-mono ${className ?? ""}`}>
      <Node value={value} depth={0} />
    </pre>
  );
}
