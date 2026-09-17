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

  const btn =
    "inline-block border border-ink px-3.5 py-2 text-sm text-ink hover:bg-ink hover:text-paper disabled:cursor-wait disabled:opacity-60";

  return (
    <section aria-live="polite">
      <h2 className="text-base font-medium">Prove you own {target.domain}</h2>
      <p className="mt-1 text-sm text-muted">
        Add one TXT record at your DNS provider. Nothing is port scanned
        until this check passes.
      </p>

      <dl className="mt-4 max-w-3xl">
        <div className="flex items-baseline gap-4 border-b border-line py-2.5">
          <dt className="w-28 shrink-0 text-xs text-muted">record name</dt>
          <dd className="min-w-0 flex-1 break-all font-mono text-sm text-ink">
            {txtName}
          </dd>
          <CopyButton value={txtName} />
        </div>
        <div className="flex items-baseline gap-4 border-b border-line py-2.5">
          <dt className="w-28 shrink-0 text-xs text-muted">record value</dt>
          <dd className="min-w-0 flex-1 break-all font-mono text-sm text-ink">
            {target.verifyToken}
          </dd>
          <CopyButton value={target.verifyToken} />
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" onClick={check} disabled={checking} className={btn}>
          {checking ? "checking..." : "check for the record"}
        </button>
        <span className="text-xs text-muted">
          DNS can take a few minutes to spread. If the check fails, wait a
          bit and try again.
        </span>
      </div>

      {error && (
        <p className="mt-3 text-sm text-high" role="alert">
          last check failed: {error}
        </p>
      )}
    </section>
  );
}
