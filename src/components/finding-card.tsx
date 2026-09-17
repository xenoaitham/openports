import { getCatalogEntry } from "@/lib/catalog";
import type { FindingView } from "@/lib/view-types";
import { evidencePairs } from "@/lib/format";
import { SeverityBadge } from "./badges";

const label =
  "block font-mono text-[11px] uppercase tracking-wide text-muted";

export default function FindingCard({ finding }: { finding: FindingView }) {
  const entry = getCatalogEntry(finding.type);
  if (!entry) return null;
  const pairs = evidencePairs(finding.evidence);

  return (
    <article className="rounded border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <SeverityBadge severity={finding.severity} />
        <h3 className="font-mono text-sm text-ink">{entry.title}</h3>
      </div>
      <p className="mt-2 text-sm text-muted">{entry.meaning}</p>

      {pairs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 font-mono text-xs text-muted">
          {pairs.map(([key, value]) => (
            <span key={key}>
              <span className="text-ink/80">{key}</span> {value}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-3 border-t border-line pt-3">
        <div>
          <span className={label}>why it matters</span>
          <p className="mt-1 text-sm text-muted">{entry.why}</p>
        </div>
        <div>
          <span className={label}>how to fix</span>
          <p className="mt-1 text-sm text-muted">{entry.fix}</p>
        </div>
      </div>
    </article>
  );
}
