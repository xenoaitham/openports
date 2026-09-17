export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// timestamps are data: compact, sortable, zero ambiguity
export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => formatValue(key, v)).join(", ");
  }
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  ) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return String(value);
}

export function evidencePairs(
  evidence: Record<string, unknown>,
): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(evidence)) {
    if (value === undefined || value === null || value === "") continue;
    out.push([key, formatValue(key, value)]);
  }
  return out;
}
