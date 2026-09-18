"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TargetDetail } from "@/lib/view-types";
import type { ScanDiff } from "@/lib/diff";
import { getCatalogEntry } from "@/lib/catalog";
import { formatDateTime, formatDuration, timeAgo } from "@/lib/format";
import { ScanStatusWord, TargetStatusWord } from "./words";
import FindingsList from "./findings";
import ScanResultTable from "./scan-result-table";
import RescanButton from "./rescan-button";
import VerifyPanel from "./verify-panel";

function ChangesBlock({ since, diff }: { since: string | null; diff: ScanDiff }) {
  const lines: string[] = [];
  for (const it of diff.portsOpened) {
    lines.push(`port ${it.port} appeared (${it.confirmed ? "confirmed" : "unconfirmed"})`);
  }
  for (const it of diff.portsClosed) {
    lines.push(`port ${it.port} closed (${it.confirmed ? "confirmed" : "unconfirmed"})`);
  }
  for (const it of diff.findingsNew) {
    lines.push(`new finding: ${getCatalogEntry(it.type)?.title ?? it.type}`);
  }
  for (const it of diff.findingsResolved) {
    lines.push(`finding resolved: ${getCatalogEntry(it.type)?.title ?? it.type}`);
  }
  for (const it of diff.certExpiryChanged) {
    lines.push(
      `certificate expiry changed on port ${it.port}: ${it.from.slice(0, 10)} to ${it.to.slice(0, 10)}`,
    );
  }

  return (
    <div>
      <p className="mt-2 text-xs text-muted">
        against the scan started {formatDateTime(since)}
      </p>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No changes. Same ports, same findings, same certificate.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">
        A change is unconfirmed until the next scan sees the same thing.
      </p>
    </div>
  );
}

export default function TargetLive({ initial }: { initial: TargetDetail }) {
  const [detail, setDetail] = useState(initial);

  // server re-renders hand down a fresh snapshot (after verify or rescan)
  useEffect(() => {
    setDetail(initial);
  }, [initial]);

  const active =
    detail.scans[0]?.status === "queued" ||
    detail.scans[0]?.status === "running";

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
        className="text-xs text-muted hover:text-ink hover:underline"
      >
        &larr; all targets
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl tracking-tight text-ink">
            {target.domain}
          </h1>
          <span className="text-sm">
            <TargetStatusWord status={target.status} />
          </span>
          {target.demo && (
            <span className="text-xs text-muted">demo host</span>
          )}
        </div>
        {target.status === "verified" && <RescanButton id={target.id} />}
      </div>

      {target.demo && (
        <p className="mt-2 text-sm text-muted">
          The Nmap project runs this host for scanner testing, so it is
          allowed without the TXT step.
        </p>
      )}

      {target.status !== "verified" && (
        <div className="mt-8">
          <VerifyPanel target={target} />
        </div>
      )}

      <section aria-live="polite" className="mt-10">
        <h2 className="text-base font-medium">Latest scan</h2>

        {latest === null ? (
          <p className="mt-2 text-sm text-muted">
            No scans yet.{" "}
            {target.status === "verified"
              ? "Press run scan again to start one."
              : "The first scan starts as soon as the TXT record checks out."}
          </p>
        ) : latest.status === "queued" ? (
          <p className="mt-2 text-sm text-medium">queued, starting shortly</p>
        ) : latest.status === "running" ? (
          <p className="mt-2 text-sm text-medium">
            running: sweeping 100 ports, then TLS, DNS and HTTP checks
          </p>
        ) : latest.status === "failed" ? (
          <div className="mt-2">
            <p className="text-sm text-high">
              scan failed: {latest.error}
            </p>
            <p className="mt-1 text-sm text-muted">
              The cause is written into the scan row. Fix it on your side if
              it is yours, then run the scan again.
            </p>
          </div>
        ) : (
          <>
            {rawResult && <ScanResultTable result={rawResult} />}
            <p
              className="mt-2 text-xs text-muted"
              // relative time is a snapshot printed at render time; the
              // client clock may have ticked past the server one
              suppressHydrationWarning
            >
              finished {timeAgo(latest.finishedAt)}, took{" "}
              {formatDuration(latest.durationMs)}, started{" "}
              {formatDateTime(latest.startedAt)}
            </p>
          </>
        )}
      </section>

      {latest?.status === "done" && detail.changes && (
        <section className="mt-10">
          <h2 className="text-base font-medium">
            Changes since the previous scan
          </h2>
          <ChangesBlock
            since={detail.changes.since}
            diff={detail.changes.diff}
          />
        </section>
      )}

      {latest?.status === "done" && (
        <section className="mt-10">
          <h2 className="text-base font-medium">
            Findings, worst first
          </h2>
          <FindingsList findings={findings} />
        </section>
      )}

      {scans.length > 1 && (
        <section className="mt-10">
          <h2 className="text-base font-medium">History</h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linestrong text-left">
                {["started", "status", "took", "ports open", "findings"].map(
                  (name) => (
                    <th
                      key={name}
                      className="py-2 pr-6 text-xs font-normal text-muted"
                    >
                      {name}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.id} className="border-b border-line">
                  <td className="py-2 pr-6 font-mono text-xs text-muted">
                    {formatDateTime(scan.startedAt)}
                  </td>
                  <td className="py-2 pr-6">
                    <ScanStatusWord status={scan.status} />
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
        <details className="mt-10 border-b border-t border-line">
          <summary className="cursor-pointer py-2.5 text-sm text-muted hover:text-ink">
            raw scan output
          </summary>
          <pre className="overflow-x-auto pb-3 font-mono text-xs text-muted">
            {JSON.stringify(rawResult, null, 2)}
          </pre>
        </details>
      )}
    </main>
  );
}
