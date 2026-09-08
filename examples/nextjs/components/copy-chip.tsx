"use client";

import { useState } from "react";

export function CopyChip({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (permissions, http) — the chip still
      // shows the command, so failing silently loses nothing.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${text}`}
      className="border-border bg-card hover:border-input inline-flex h-11 cursor-pointer items-center gap-3 rounded-md border px-4 font-mono text-sm transition-colors"
    >
      <span className="text-muted-foreground" aria-hidden="true">
        $
      </span>
      {text}
      {copied ? (
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="var(--brace-open)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 8.5 6 12l7.5-8" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted-foreground"
          aria-hidden="true"
        >
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5V9A1.5 1.5 0 0 0 4 10.5h1.5" />
        </svg>
      )}
    </button>
  );
}
