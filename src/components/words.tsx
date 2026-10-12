import type { ScanStatus, Severity, TargetStatus } from "@/lib/types";

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
  const className = status === "verified" ? "" : "text-muted";
  return <span className={className}>{status}</span>;
}

export function ScanStatusWord({ status }: { status: ScanStatus }) {
  const className =
    status === "failed"
      ? "text-high"
      : status === "running" || status === "queued"
        ? "text-medium"
        : "";
  return <span className={className}>{status}</span>;
}
