import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  findings,
  scans,
  targets,
  type ScanRow,
  type TargetRow,
} from "@/db/schema";
import { runScanChecks } from "./scanner";
import { evaluateScanResult } from "./evaluate";
import { isPreallowed } from "./host";

// simple in-process worker: one queued scan at a time, oldest first.
// the globals keep state across next dev hot reloads, otherwise every code
// edit would start a second poller and run scans twice.
type WorkerGlobal = typeof globalThis & {
  __openportsTimer?: NodeJS.Timeout;
  __openportsBusy?: boolean;
};
const g = globalThis as WorkerGlobal;

export function ensureWorker() {
  if (!g.__openportsTimer) {
    g.__openportsTimer = setInterval(() => void tick(), 2000);
    g.__openportsTimer.unref();
  }
}

export async function enqueueScan(targetId: number) {
  await db.insert(scans).values({ targetId, status: "queued" });
  ensureWorker();
  void tick();
}

async function claimNext(): Promise<{ scan: ScanRow; target: TargetRow } | null> {
  const rows = await db
    .select({ scan: scans, target: targets })
    .from(scans)
    .innerJoin(targets, eq(scans.targetId, targets.id))
    .where(eq(scans.status, "queued"))
    .orderBy(asc(scans.id))
    .limit(1);
  return rows[0] ?? null;
}

async function tick() {
  if (g.__openportsBusy) return;
  g.__openportsBusy = true;
  try {
    for (;;) {
      const next = await claimNext();
      if (!next) break;
      await runOne(next.scan, next.target);
    }
  } finally {
    g.__openportsBusy = false;
  }
}

async function runOne(scan: ScanRow, target: TargetRow) {
  await db
    .update(scans)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(scans.id, scan.id));
  try {
    // hard line: active scans need ownership proof. scanme.nmap.org is the
    // single exception, the Nmap project allows scanning it.
    if (target.status !== "verified" && !isPreallowed(target.domain)) {
      throw new Error("target is not verified, active scans stay off");
    }
    const result = await runScanChecks(target.domain);
    const derived = evaluateScanResult(result);
    if (derived.length > 0) {
      await db.insert(findings).values(
        derived.map((d) => ({
          scanId: scan.id,
          targetId: target.id,
          type: d.type,
          severity: d.severity,
          evidence: JSON.stringify(d.evidence),
        })),
      );
    }
    await db
      .update(scans)
      .set({
        status: "done",
        finishedAt: new Date(),
        result: JSON.stringify(result),
        error: null,
      })
      .where(eq(scans.id, scan.id));
  } catch (err) {
    await db
      .update(scans)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(scans.id, scan.id));
  }
}
