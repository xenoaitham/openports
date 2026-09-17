import type { ScanStatus, Severity, TargetStatus } from "@/lib/types";

const base =
  "inline-block rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide";

const severityClass: Record<Severity, string> = {
  high: "text-high border-high/40 bg-high/10",
  medium: "text-medium border-medium/40 bg-medium/10",
  low: "text-low border-low/40 bg-low/10",
  info: "text-info border-info/40 bg-info/10",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`${base} ${severityClass[severity]}`}>{severity}</span>
  );
}

const scanStatusClass: Record<ScanStatus, string> = {
  queued: "text-muted border-line bg-panel",
  running: "text-medium border-medium/40 bg-medium/10",
  done: "text-accent border-accent/40 bg-accent/10",
  failed: "text-high border-high/40 bg-high/10",
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  return <span className={`${base} ${scanStatusClass[status]}`}>{status}</span>;
}

const targetStatusClass: Record<TargetStatus, string> = {
  pending: "text-muted border-line bg-panel",
  verified: "text-accent border-accent/40 bg-accent/10",
  failed: "text-high border-high/40 bg-high/10",
};

export function TargetStatusBadge({ status }: { status: TargetStatus }) {
  return (
    <span className={`${base} ${targetStatusClass[status]}`}>{status}</span>
  );
}
