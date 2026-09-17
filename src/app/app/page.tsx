import type { Metadata } from "next";
import AddTargetForm from "@/components/add-target-form";
import { ScanStatusBadge, TargetStatusBadge } from "@/components/badges";
import { listTargetOverviews } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

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
      <h1 className="font-mono text-xl text-ink">Targets</h1>
      <p className="mt-1 text-sm text-muted">
        Add a domain. It gets scanned after you prove ownership with one DNS
        record, never before.
      </p>

      <AddTargetForm />

      {targets.length === 0 ? (
        <div className="mt-10 rounded border border-dashed border-line p-10 text-center">
          <p className="font-mono text-sm text-ink">no targets yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Add a domain above. You will get one TXT record to publish, and the
            first scan starts once it checks out.
          </p>
        </div>
      ) : (
        <table className="mt-10 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {["domain", "status", "last scan", "open ports", "findings"].map(
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
            {targets.map((target) => (
              <tr key={target.id} className="border-b border-line/60">
                <td className="py-3 pr-6">
                  <a
                    href={`/targets/${target.id}`}
                    className="font-mono text-ink hover:text-accent"
                  >
                    {target.domain}
                  </a>
                </td>
                <td className="py-3 pr-6">
                  <TargetStatusBadge status={target.status} />
                </td>
                <td className="py-3 pr-6">
                  {target.lastScan ? (
                    <span className="flex items-center gap-2">
                      <ScanStatusBadge status={target.lastScan.status} />
                      <span className="font-mono text-xs text-muted">
                        {timeAgo(
                          target.lastScan.finishedAt ??
                            target.lastScan.startedAt,
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-muted">never</span>
                  )}
                </td>
                <td className="py-3 pr-6 font-mono text-xs text-muted">
                  {target.openPorts.length > 0
                    ? target.openPorts.join(", ")
                    : "-"}
                </td>
                <td className="py-3 pr-6">
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
      <span className="font-mono text-xs text-accent">clean</span>
    ) : (
      <span className="font-mono text-xs text-muted">-</span>
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
