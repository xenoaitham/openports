import { getCatalogEntry, severityRank } from "@/lib/catalog";
import type { FindingView } from "@/lib/view-types";
import { evidencePairs } from "@/lib/format";
import { SeverityWord } from "./words";

// findings as a report list, worst first. shared by the landing page and the
// target page so both show the same thing.
export default function FindingsList({ findings }: { findings: FindingView[] }) {
  if (findings.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        Nothing found. Every check came back clean. That is a real result, not
        a missing check.
      </p>
    );
  }
  const sorted = [...findings].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) || a.id - b.id,
  );
  return (
    <ul className="mt-3 divide-y divide-line border-b border-t border-line">
      {sorted.map((finding) => (
        <FindingItem key={finding.id} finding={finding} />
      ))}
    </ul>
  );
}

function FindingItem({ finding }: { finding: FindingView }) {
  const entry = getCatalogEntry(finding.type);
  if (!entry) return null;
  const pairs = evidencePairs(finding.evidence);

  return (
    <li className="grid grid-cols-[6rem_1fr] gap-x-5 py-4">
      <SeverityWord severity={finding.severity} />
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-ink">{entry.title}</h3>

        {pairs.length > 0 && (
          <p className="mt-1 font-mono text-xs text-muted">
            {pairs.map(([key, value]) => (
              <span key={key} className="mr-5 inline-block">
                {key} <span className="text-ink">{value}</span>
              </span>
            ))}
          </p>
        )}

        <p className="mt-2 text-sm text-muted">{entry.meaning}</p>

        <details className="mt-1 text-sm">
          <summary className="w-fit cursor-pointer text-muted hover:text-ink">
            why it matters
          </summary>
          <p className="mt-1 text-muted">{entry.why}</p>
        </details>

        <p className="mt-2 text-sm">
          <span className="font-medium">Fix: </span>
          <span className="text-muted">{entry.fix}</span>
        </p>
      </div>
    </li>
  );
}
