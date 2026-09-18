import type { ScanDiff } from "@/lib/diff";
import { getCatalogEntry } from "@/lib/catalog";

// one line per change, the same words on the target page and on the cross
// target feed of the dashboard. port and finding lines carry the hysteresis
// label; a certificate renewal is a fact rather than a flapping state, so it
// carries none.
export function changeLines(diff: ScanDiff): string[] {
  const lines: string[] = [];
  for (const it of diff.portsOpened) {
    lines.push(
      `port ${it.port} appeared (${it.confirmed ? "confirmed" : "unconfirmed"})`,
    );
  }
  for (const it of diff.portsClosed) {
    lines.push(
      `port ${it.port} closed (${it.confirmed ? "confirmed" : "unconfirmed"})`,
    );
  }
  for (const it of diff.findingsNew) {
    lines.push(
      `new finding: ${getCatalogEntry(it.type)?.title ?? it.type} (${
        it.confirmed ? "confirmed" : "unconfirmed"
      })`,
    );
  }
  for (const it of diff.findingsResolved) {
    lines.push(
      `finding resolved: ${getCatalogEntry(it.type)?.title ?? it.type} (${
        it.confirmed ? "confirmed" : "unconfirmed"
      })`,
    );
  }
  for (const it of diff.certExpiryChanged) {
    lines.push(
      `certificate expiry changed on port ${it.port}: ${it.from.slice(0, 10)} to ${it.to.slice(0, 10)}`,
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
