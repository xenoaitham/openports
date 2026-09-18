import { sql } from "drizzle-orm";
import { scans, targets } from "@/db/schema";

// rescan cadence for verified targets. one global default in plain code:
// no settings surface, no per target config. six hours gives the changes
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

// select fields for the scheduler pass: per verified target, whether a scan
// is queued or running, and the newest done finish time. the correlated
// subqueries spell out table qualified names on purpose. drizzle renders an
// interpolated column object unqualified, and inside the subquery a bare
// "id" then resolves to scans.id instead of targets.id, which once made the
// scheduler see a stale cadence and rescan in a loop.
export const schedulerFields = {
  id: targets.id,
  active: sql<boolean>`EXISTS (
    SELECT 1 FROM scans
    WHERE scans.target_id = targets.id
      AND scans.status IN ('queued', 'running')
  )`,
  lastDoneAt: sql<number | null>`(
    SELECT MAX(scans.finished_at) FROM scans
    WHERE scans.target_id = targets.id
      AND scans.status = 'done'
  )`,
};
