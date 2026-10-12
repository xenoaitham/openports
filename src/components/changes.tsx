import type { ScanDiff } from "@/lib/diff";
import { getCatalogEntry } from "@/lib/catalog";

// Port and finding changes need confirmation; certificate renewals do not.
export function changeLines(diff: ScanDiff): string[] {
  const lines: string[] = [];
  for (const change of diff.portsOpened) {
    lines.push(
      `port ${change.port} appeared (${change.confirmed ? "confirmed" : "unconfirmed"})`,
    );
  }
  for (const change of diff.portsClosed) {
    lines.push(
      `port ${change.port} closed (${change.confirmed ? "confirmed" : "unconfirmed"})`,
    );
  }
  for (const change of diff.findingsNew) {
    lines.push(
      `new finding: ${getCatalogEntry(change.type)?.title ?? change.type} (${
        change.confirmed ? "confirmed" : "unconfirmed"
      })`,
    );
  }
  for (const change of diff.findingsResolved) {
    lines.push(
      `finding resolved: ${getCatalogEntry(change.type)?.title ?? change.type} (${
        change.confirmed ? "confirmed" : "unconfirmed"
      })`,
    );
  }
  for (const change of diff.certExpiryChanged) {
    lines.push(
      `certificate expiry changed on port ${change.port}: ${change.from.slice(0, 10)} to ${change.to.slice(0, 10)}`,
    );
  }
  return lines;
}

export default function ChangesList({ diff }: { diff: ScanDiff }) {
  const lines = changeLines(diff);
  if (lines.length === 0) {
    return (
      <p className="mt-2 text-sm text-muted">
        No changes. Same ports, same findings, same certificate.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
