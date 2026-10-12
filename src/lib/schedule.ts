import { sql } from "drizzle-orm";
import { scans, targets } from "@/db/schema";

// Scheduled scans run at most four times per day for each verified target.
export const RESCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Failed attempts reset the interval too, preventing repeated retries on each tick.
export function rescanDue(
  newestFinishedAt: number | null,
  now: number,
  intervalMs: number = RESCAN_INTERVAL_MS,
): boolean {
  if (newestFinishedAt === null) return true;
  return now - newestFinishedAt >= intervalMs;
}

// Qualify the outer target ID: an unqualified ID can bind to the inner scans table.
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
