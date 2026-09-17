"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AddTargetForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!domain.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const body = (await res.json()) as { ok?: boolean; id?: number; error?: string };
      if (res.ok && body.ok && body.id) {
        router.push(`/targets/${body.id}`);
        return;
      }
      setError(body.error ?? "could not add the domain");
    } catch {
      setError("network error, try again");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-wrap items-center gap-3">
      <input
        value={domain}
        onChange={(event) => setDomain(event.target.value)}
        placeholder="example.com"
        aria-label="domain to watch"
        autoComplete="off"
        spellCheck={false}
        className="w-72 border border-linestrong bg-paper px-2.5 py-1.5 font-mono text-sm text-ink placeholder:text-muted/60 focus:border-ink focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !domain.trim()}
        className="border border-ink px-3.5 py-1.5 text-sm text-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "adding..." : "add target"}
      </button>
      {error && (
        <span className="text-sm text-high" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
