"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TargetDetail } from "@/lib/view-types";
import { formatDateTime, formatDuration, timeAgo } from "@/lib/format";
import { ScanStatusBadge, TargetStatusBadge } from "./badges";
import FindingCard from "./finding-card";
import RescanButton from "./rescan-button";
import VerifyPanel from "./verify-panel";

const h2 =
  "font-mono text-[11px] uppercase tracking-wide text-muted";

export default function TargetLive({ initial }: { initial: TargetDetail }) {
  const [detail, setDetail] = useState(initial);

  // server re-renders hand down a fresh snapshot (after verify or rescan)
  useEffect(() => {
    setDetail(initial);
  }, [initial]);

  const active =
    detail.scans[0]?.status === "queued" || detail.scans[0]?.status === "running";

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/targets/${initial.target.id}`, {
          cache: "no-store",
        });
        if (res.ok) setDetail((await res.json()) as TargetDetail);
      } catch {
        // keep polling, transient network errors are not fatal
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [active, initial.target.id]);

  const { target, scans, findings, rawResult } = detail;
  const latest = scans[0] ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href="/app"
        className="font-mono text-xs text-muted hover:text-ink"
      >
        &larr; all targets
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl text-ink">{target.domain}</h1>
          <TargetStatusBadge status={target.status} />
          {target.demo && (
            <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted">
              demo target
            </span>
          )}
        </div>
        {target.status === "verified" && <RescanButton id={target.id} />}
      </div>

      {target.demo && (
        <p className="mt-2 text-sm text-muted">
          The Nmap project runs this host for scanner testing, so it is allowed
          without the TXT step.
        </p>
      )}

      {target.status !== "verified" && (
        <div className="mt-8">
          <VerifyPanel target={target} />
        </div>
      )}

      <section aria-live="polite" className="mt-8">
        <h2 className={h2}>latest scan</h2>

        {latest === null ? (
          <p className="mt-3 rounded border border-dashed border-line p-6 text-sm text-muted">
            No scans yet.{" "}
            {target.status === "verified"
              ? "Press run scan again to start one."
              : "The first scan starts as soon as the TXT record checks out."}
          </p>
        ) : latest.status === "queued" ? (
          <div className="mt-3 flex items-center gap-3 rounded border border-medium/40 bg-medium/5 p-4">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-medium" />
            <p className="font-mono text-sm text-medium">
              queued, starting shortly
            </p>
          </div>
        ) : latest.status === "running" ? (
          <div className="mt-3 flex items-center gap-3 rounded border border-medium/40 bg-medium/5 p-4">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-medium" />
            <p className="font-mono text-sm text-medium">
              running: sweeping 100 ports, then TLS, DNS and HTTP checks
            </p>
          </div>
        ) : latest.status === "failed" ? (
          <div className="mt-3 rounded border border-high/40 bg-high/5 p-4">
            <p className="font-mono text-sm text-high">
              scan failed: {latest.error}
            </p>
            <p className="mt-1 text-sm text-muted">
              If the cause is on your side, fix it and run the scan again.
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 font-mono text-xs text-muted">
            <span>finished {timeAgo(latest.finishedAt)}</span>
            <span>took {formatDuration(latest.durationMs)}</span>
            <span>
              ports open:{" "}
              <span className="text-ink/80">
                {latest.openPorts.length > 0
                  ? latest.openPorts.join(", ")
                  : "none"}
              </span>
            </span>
            <span>
              findings: <span className="text-ink/80">{findings.length}</span>
            </span>
          </div>
        )}
      </section>

      {latest?.status === "done" && (
        <section className="mt-8">
          <h2 className={h2}>findings</h2>
          {findings.length === 0 ? (
            <p className="mt-3 rounded border border-dashed border-line p-6 text-sm text-muted">
              Nothing found in this scan. Every check came back clean. That is
              a real result, not a missing check.
            </p>
          ) : (
            <div className="mt-3 grid gap-3">
              {findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          )}
        </section>
      )}

      {scans.length > 1 && (
        <section className="mt-10">
          <h2 className={h2}>history</h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {["started", "status", "took", "ports open", "findings"].map(
                  (name) => (
                    <th
                      key={name}
                      className="py-2 pr-6 font-mono text-[11px] font-normal uppercase tracking-wide text-muted"
                    >
                      {name}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.id} className="border-b border-line/60">
                  <td className="py-2 pr-6 font-mono text-xs text-muted">
                    {formatDateTime(scan.startedAt)}
                  </td>
                  <td className="py-2 pr-6">
                    <ScanStatusBadge status={scan.status} />
                  </td>
                  <td className="py-2 pr-6 font-mono text-xs text-muted">
                    {formatDuration(scan.durationMs)}
                  </td>
                  <td className="py-2 pr-6 font-mono text-xs text-muted">
                    {scan.openPorts.length > 0
                      ? scan.openPorts.join(", ")
                      : "-"}
                  </td>
                  <td className="py-2 pr-6 font-mono text-xs text-muted">
                    {scan.status === "done" ? scan.findingCount : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {rawResult && (
        <details className="mt-10 rounded border border-line bg-panel">
          <summary className="cursor-pointer px-4 py-3 font-mono text-sm text-muted">
            raw scan output
          </summary>
          <pre className="overflow-x-auto border-t border-line px-4 py-3 font-mono text-xs text-muted">
            {JSON.stringify(rawResult, null, 2)}
          </pre>
        </details>
      )}
    </main>
  );
}
