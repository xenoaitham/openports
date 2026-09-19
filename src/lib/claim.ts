import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { scans, type ScanRow } from "@/db/schema";
import type * as schema from "@/db/schema";

// the db handle is a parameter, not an import, so tests can pin the claim
// against an in-memory database instead of the real file.
type Db = BetterSQLite3Database<typeof schema>;

// the claim. one UPDATE statement, atomic by construction: the row to claim
// is picked by a subquery inside the same statement that flips it to
// running, and the outer status check makes a row that lost a race update
// nothing. two workers can never take one row, in one process or across
// processes, because sqlite serializes writers and the statement reads and
// writes in one unit.
//
// politeness, written down: the claim skips a queued scan while a scan of
// the same target is running, and while a scan of any target resolving to
// the same address is running. one host is never swept from two workers at
// once; a shared box behind two names waits its turn. the address is the
// one stored on the target row, set when the target is added and refreshed
// by every finished scan, so a host that moves between addresses between
// scans can momentarily miss the match. the skip also pins the order within
// one target: a target's second scan cannot start before its first has
// finished, so a burst on one host stays strictly serial, oldest first.
// across targets the claim still takes the oldest row it may take; the
// queue is oldest first, skipping only rows the politeness rule holds.
// the match on one stored address is a decision, not an oversight. a scan
// result may report several addresses, but a result is written at
// completion, so a running scan has nothing to match on yet; matching every
// reported address would need an address history table and a join in the
// predicate, real machinery for a host behind round robin dns, which a
// small company's two names rarely are. a miss costs at most two sweeps of
// one physical host, the same traffic two genuinely different hosts get.
// when in doubt, do less.
//
// every table name in the raw fragment is spelled out by hand. drizzle
// renders an interpolated column object unqualified, and inside a subquery
// a bare "id" then resolves to the inner table; that bug once made the
// scheduler rescan in a loop, and the sql is pinned in tests to keep it
// from coming back through this statement.
// exported so tests can pin the generated sql by shape
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

// a scan that was running when the process died would sit in "running"
// forever, and with the pool that can now be several rows at once. at boot,
// write down what actually happened for every one of them: the scan did not
// finish. the scheduler reads a stuck running row as work in progress and
// would stall that target's cadence forever.
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
