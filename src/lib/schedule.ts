// rescan cadence for verified targets. one global default in plain code:
// no settings surface, no per-target config. six hours gives the changes
// feed a heartbeat while staying polite to shared scan targets, scanme
// .nmap.org asks for no more than a few scans per day.
export const RESCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;

// a verified target is due when its newest done scan is older than the
// cadence, or when it has no done scan yet (first scan failed, or the row
// predates the cadence). pure, so the rule gets tested without a database.
export function rescanDue(
  lastDoneAt: number | null,
  now: number,
  intervalMs: number = RESCAN_INTERVAL_MS,
): boolean {
  if (lastDoneAt === null) return true;
  return now - lastDoneAt >= intervalMs;
}
