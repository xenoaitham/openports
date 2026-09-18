import type { ScanStatus, Severity, TargetStatus } from "@/lib/types";

// statuses are words, not pills. color on a status only marks severity or a
// real failure, nothing else in the interface carries color.
const severityClass: Record<Severity, string> = {
  high: "text-high",
  medium: "text-medium",
  low: "text-low",
  info: "text-info",
};

export function SeverityWord({ severity }: { severity: Severity }) {
  return (
    <span className={`${severityClass[severity]} font-medium`}>{severity}</span>
  );
}

export function TargetStatusWord({ status }: { status: TargetStatus }) {
  const cls = status === "verified" ? "" : "text-muted";
  return <span className={cls}>{status}</span>;
}

export function ScanStatusWord({ status }: { status: ScanStatus }) {
  const cls =
    status === "failed"
      ? "text-high"
      : status === "running" || status === "queued"
        ? "text-medium"
        : "";
  return <span className={cls}>{status}</span>;
}
