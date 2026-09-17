"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RescanButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function rescan() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/targets/${id}/rescan`, { method: "POST" });
      router.refresh();
    } catch {
      // the poll loop will pick the scan up anyway
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={rescan}
      disabled={busy}
      className="border border-ink px-3 py-1.5 text-sm text-ink hover:bg-ink hover:text-paper disabled:cursor-wait disabled:opacity-50"
    >
      {busy ? "queueing..." : "run scan again"}
    </button>
  );
}
