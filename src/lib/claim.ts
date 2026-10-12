import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { scans, type ScanRow } from "@/db/schema";
import type * as schema from "@/db/schema";

// the db handle is a parameter, not an import, so tests can pin the claim
// against an in-memory database instead of the real file.
type Db = BetterSQLite3Database<typeof schema>;

// Claim the oldest eligible row in one atomic UPDATE. SQLite serializes writers.
// Skip targets with running scans, including targets sharing a stored IP address.
// The stored address may be stale until the next scan completes.
// Qualify table names inside subqueries to avoid binding IDs to the wrong table.
export const claimWhere = and(
  eq(scans.status, "queued"),
  sql`scans.id = (
    SELECT s.id FROM scans s
    JOIN targets st ON st.id = s.target_id
    WHERE s.status = 'queued'
      AND NOT EXISTS (
        SELECT 1 FROM scans busy
        JOIN targets bt ON bt.id = busy.target_id
        WHERE busy.status = 'running'
          AND (
            busy.target_id = s.target_id
            OR (bt.ip IS NOT NULL AND bt.ip = st.ip)
          )
      )
    ORDER BY s.id
    LIMIT 1
  )`,
);

export async function claimOneScan(db: Db): Promise<ScanRow | null> {
  const claimed = await db
    .update(scans)
    .set({ status: "running", startedAt: new Date() })
    .where(claimWhere)
    .returning();
  return claimed[0] ?? null;
}

// Release interrupted scans so they do not block the scheduler after a restart.
export async function failInterruptedScans(db: Db): Promise<void> {
  await db
    .update(scans)
    .set({
      status: "failed",
      error: "scan interrupted: the server restarted before it finished",
      finishedAt: new Date(),
    })
    .where(eq(scans.status, "running"));
}
