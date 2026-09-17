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
      className="shrink-0 border border-linestrong px-1.5 py-0.5 text-xs text-muted hover:border-ink hover:text-ink"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
