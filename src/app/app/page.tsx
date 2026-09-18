import type { Metadata } from "next";
import AddTargetForm from "@/components/add-target-form";
import { ScanStatusWord, TargetStatusWord } from "@/components/words";
import { listTargetOverviews } from "@/lib/queries";
import { RESCAN_INTERVAL_MS } from "@/lib/schedule";
import { timeAgo } from "@/lib/format";
import type { TargetOverview } from "@/lib/view-types";

export const metadata: Metadata = {
  title: "Targets",
  description:
    "Your watched domains, their verification state and the latest scan results.",
};

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const targets = await listTargetOverviews();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-medium tracking-tight">Targets</h1>
      <p className="mt-1 text-sm text-muted">
        Add a domain. It gets scanned after you prove ownership with one DNS
        record, never before. Verified targets are then rescanned every{" "}
        {RESCAN_INTERVAL_MS / 3_600_000} hours on their own.
      </p>

      <AddTargetForm />

      {targets.length === 0 ? (
        <p className="mt-10 max-w-2xl text-sm text-muted">
          No targets yet. Add a domain above and you get one TXT record to
          publish; the first scan starts once it checks out.
        </p>
      ) : (
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linestrong text-left">
              {["domain", "status", "last scan", "open ports", "findings"].map(
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
            {targets.map((target) => (
              <tr key={target.id} className="border-b border-line">
                <td className="py-2 pr-6">
                  <a
                    href={`/targets/${target.id}`}
                    className="font-mono text-sm text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
                  >
                    {target.domain}
                  </a>
                </td>
                <td className="py-2 pr-6">
                  <TargetStatusWord status={target.status} />
                </td>
                <td className="py-2 pr-6">
                  {target.lastScan ? (
                    <span
                      className="flex items-baseline gap-3"
                      // relative time is a snapshot printed at render time
                      suppressHydrationWarning
                    >
                      <ScanStatusWord status={target.lastScan.status} />
                      <span className="font-mono text-xs text-muted">
                        {lastScanTime(target)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted">never</span>
                  )}
                </td>
                <td className="py-2 pr-6 font-mono text-xs text-muted">
                  {target.openPorts.length > 0
                    ? target.openPorts.join(", ")
                    : "-"}
                </td>
                <td className="py-2 pr-6">
                  <Counts
                    counts={target.counts}
                    showClean={target.lastScan?.status === "done"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function lastScanTime(target: TargetOverview): string {
  if (!target.lastScan) return "never";
  if (
    target.lastScan.status === "done" ||
    target.lastScan.status === "failed"
  ) {
    return timeAgo(target.lastScan.finishedAt ?? target.lastScan.startedAt);
  }
  // queued and running scans have no finish yet: say when they started
  return target.lastScan.startedAt
    ? `started ${timeAgo(target.lastScan.startedAt)}`
    : "";
}

function Counts({
  counts,
  showClean,
}: {
  counts: { high: number; medium: number; low: number; info: number };
  showClean: boolean;
}) {
  const entries = [
    ["high", counts.high, "text-high"],
    ["medium", counts.medium, "text-medium"],
    ["low", counts.low, "text-low"],
    ["info", counts.info, "text-info"],
  ] as const;
  const active = entries.filter(([, n]) => n > 0);
  if (active.length === 0) {
    return showClean ? (
      <span className="text-xs text-muted">clean</span>
    ) : (
      <span className="text-xs text-muted">-</span>
    );
  }
  return (
    <span className="flex gap-3 font-mono text-xs">
      {active.map(([name, n, color]) => (
        <span key={name} className={color}>
          {n} {name}
        </span>
      ))}
    </span>
  );
}
