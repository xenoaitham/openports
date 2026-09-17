"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetView } from "@/lib/view-types";
import { CopyButton } from "./copy-button";

export default function VerifyPanel({ target }: { target: TargetView }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(target.failReason);

  const txtName = `_openports.${target.domain}`;

  async function check() {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/targets/${target.id}/verify`, {
        method: "POST",
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (body.ok) {
        router.refresh();
      } else {
        setError(body.error ?? "check failed");
      }
    } catch {
      setError("network error, try again");
    }
    setChecking(false);
  }

  return (
    <section
      aria-live="polite"
      className="rounded border border-line bg-panel p-5"
    >
      <h2 className="font-mono text-sm text-ink">
        Prove you own {target.domain}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Add one TXT record at your DNS provider. Nothing is port scanned until
        this check passes.
      </p>

      <div className="mt-4 grid gap-3">
        <div>
          <span className="block font-mono text-[11px] uppercase tracking-wide text-muted">
            record name
          </span>
          <div className="mt-1 flex items-center gap-3 rounded border border-line bg-base px-3 py-2">
            <code className="break-all font-mono text-sm text-ink">
              {txtName}
            </code>
            <CopyButton value={txtName} />
          </div>
        </div>
        <div>
          <span className="block font-mono text-[11px] uppercase tracking-wide text-muted">
            record value
          </span>
          <div className="mt-1 flex items-center gap-3 rounded border border-line bg-base px-3 py-2">
            <code className="break-all font-mono text-sm text-accent">
              {target.verifyToken}
            </code>
            <CopyButton value={target.verifyToken} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={check}
          disabled={checking}
          className="rounded border border-accent/50 bg-accent/10 px-4 py-2 font-mono text-sm text-accent hover:bg-accent/20 disabled:cursor-wait disabled:opacity-60"
        >
          {checking ? "checking..." : "check for the record"}
        </button>
        <span className="text-xs text-muted">
          DNS can take a few minutes to spread. If the check fails, wait a bit
          and try again.
        </span>
      </div>

      {error && (
        <p className="mt-3 font-mono text-sm text-high" role="alert">
          last check failed: {error}
        </p>
      )}
    </section>
  );
}
