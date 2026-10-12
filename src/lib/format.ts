export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const elapsed = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(1, Math.floor(elapsed / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatValue).join(", ");
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
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(evidence)) {
    if (value === undefined || value === null || value === "") continue;
    pairs.push([key, formatValue(value)]);
  }
  return pairs;
}
