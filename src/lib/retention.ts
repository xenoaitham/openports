import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { scans } from "@/db/schema";

// scan retention. the scans table grows four rows per target per day on the
// cadence, forever. one plain rule, decided in code like the cadence itself,
// no settings surface: keep the last RETAIN_DONE_SCANS done scans per
// target, delete the ones before them. failed and queued rows are not
// touched; the rule bounds history, it does not sweep garbage.
//
// the audit trail implication, written down on purpose: a deleted scan takes
// its stored diff and its findings with it through the foreign key cascade.
// nothing display facing misses them, the changes feeds read the last three
// done scans and the changed column walks back at most 500 stored diffs, so
// the bound below stays far above what any view can reach. what dies is old
// raw output: nobody can ask what port 80 answered two months ago.
export const RETAIN_DONE_SCANS = 100;

// pure, so the rule gets tested without a database. ids are newest first.
export function doneScanIdsToDelete(idsNewestFirst: number[]): number[] {
  return idsNewestFirst.slice(RETAIN_DONE_SCANS);
}

export async function pruneDoneScans(targetId: number): Promise<void> {
  const rows = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.targetId, targetId), eq(scans.status, "done")))
    .orderBy(desc(scans.id));
  const doomed = doneScanIdsToDelete(rows.map((r) => r.id));
  if (doomed.length === 0) return;
  await db.delete(scans).where(inArray(scans.id, doomed));
}
