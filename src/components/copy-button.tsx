"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "copied" : "copy to clipboard"}
      className="ml-auto shrink-0 rounded border border-line px-2 py-0.5 font-mono text-[11px] text-muted hover:border-accent hover:text-accent"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
