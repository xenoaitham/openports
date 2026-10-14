"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RescanButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rescan() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/targets/${id}/rescan`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json() as { error?: string; retryAfterSeconds?: number };
        const retry = body.retryAfterSeconds
          ? ` Try after ${new Date(Date.now() + body.retryAfterSeconds * 1000).toLocaleTimeString()}.`
          : "";
        setError(`${body.error ?? "Could not queue the scan."}${retry}`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm">
      <button
        type="button"
        onClick={rescan}
        disabled={busy}
        className="border border-ink px-3.5 py-1.5 text-sm text-ink hover:bg-ink hover:text-paper disabled:cursor-wait disabled:opacity-50"
      >
        {busy ? "queueing..." : "run scan again"}
      </button>
      {error && <p className="mt-2 text-sm text-high" role="alert">{error}</p>}
    </div>
  );
}
