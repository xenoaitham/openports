import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { scans } from "@/db/schema";

// Deleting completed scans also deletes their findings and stored diffs.
// Failed and queued scans are excluded from retention.
export const RETAIN_DONE_SCANS = 100;

// The caller supplies IDs in descending order.
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
