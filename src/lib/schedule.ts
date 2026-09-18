import { sql } from "drizzle-orm";
import { scans, targets } from "@/db/schema";

// rescan cadence for verified targets. one global default in plain code:
// no settings surface, no per target config. six hours gives the changes
// feed a heartbeat while staying polite to shared scan targets, scanme
// .nmap.org asks for no more than a few scans per day.
export const RESCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;

// a verified target is due when its newest finished scan of any status is
// older than the cadence, or when it has none. the attempt counts, not just
// the success, and that is a decision, written down: a target whose scans
// never succeed used to be requeued on every two second tick forever,
// because the old rule read "no done scan" as due. that is a storm against
// a host that is already failing, so it was removed. a verified target with
// a failing scan is now retried once per cadence, six hours later, the same
// wait a healthy target gets; anyone watching can still press run scan, and
// the row shows why the scan failed. when in doubt, do less. pure, so the
// rule gets tested without a database.
export function rescanDue(
  newestFinishedAt: number | null,
  now: number,
  intervalMs: number = RESCAN_INTERVAL_MS,
): boolean {
  if (newestFinishedAt === null) return true;
  return now - newestFinishedAt >= intervalMs;
}

// select fields for the scheduler pass: per verified target, whether a scan
// is queued or running, and the newest finish time of any scan. the
// correlated subqueries spell out table qualified names on purpose. drizzle
// renders an interpolated column object unqualified, and inside the
// subquery a bare "id" then resolves to scans.id instead of targets.id,
// which once made the scheduler see a stale cadence and rescan in a loop.
export const schedulerFields = {
  id: targets.id,
  active: sql<boolean>`EXISTS (
    SELECT 1 FROM scans
    WHERE scans.target_id = targets.id
      AND scans.status IN ('queued', 'running')
  )`,
  lastAttemptAt: sql<number | null>`(
    SELECT MAX(scans.finished_at) FROM scans
    WHERE scans.target_id = targets.id
  )`,
};
