import { and, asc, desc, eq, lt } from "drizzle-orm";
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
import { diffScanOutputs, type DiffInput } from "./diff";
import { isPreallowed } from "./host";
import { pruneDoneScans } from "./retention";
import { rescanDue, schedulerFields } from "./schedule";
import type { ScanResult } from "./scan-types";

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

function parseResult(row: ScanRow): ScanResult | null {
  if (!row.result) return null;
  try {
    return JSON.parse(row.result) as ScanResult;
  } catch {
    return null;
  }
}

async function previousDoneInput(
  targetId: number,
  beforeScanId: number,
): Promise<DiffInput | null> {
  const [row] = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.targetId, targetId),
        eq(scans.status, "done"),
        lt(scans.id, beforeScanId),
      ),
    )
    .orderBy(desc(scans.id))
    .limit(1);
  if (!row) return null;
  const types = await db
    .select({ type: findings.type })
    .from(findings)
    .where(eq(findings.scanId, row.id));
  return { result: parseResult(row), findingTypes: types.map((t) => t.type) };
}

// a scan that was running when the process died would sit in "running"
// forever, and the scheduler would read that as work in progress and never
// rescan the target. at boot, write down what actually happened: the scan
// did not finish.
export async function failInterruptedScans() {
  await db
    .update(scans)
    .set({
      status: "failed",
      error: "scan interrupted: the server restarted before it finished",
      finishedAt: new Date(),
    })
    .where(eq(scans.status, "running"));
}

// the scheduled pass over verified targets. a target is due when its newest
// done scan is older than the cadence. a target that already has a queued or
// running scan is skipped, so a scheduled rescan never piles up behind a
// scan that has not run yet; once that scan lands, its finished time resets
// the cadence and the next tick sees the target as not due.
async function enqueueDueRescans() {
  const rows = await db
    .select(schedulerFields)
    .from(targets)
    .where(eq(targets.status, "verified"));
  const now = Date.now();
  for (const row of rows) {
    if (row.active) continue;
    if (!rescanDue(row.lastDoneAt ?? null, now)) continue;
    await db.insert(scans).values({ targetId: row.id, status: "queued" });
  }
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
    // queue drained: offer the scheduled rescans. anything queued here is
    // picked up by the next tick, two seconds later at the latest. the busy
    // guard holds for the whole pass, so scanning stays one at a time.
    await enqueueDueRescans();
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

    // record what changed against the previous done scan. the raw diff is
    // the audit trail; the page recomputes it with hysteresis so a flap
    // that resolved itself shows up correctly no matter when you look.
    const prev = await previousDoneInput(target.id, scan.id);
    if (prev) {
      const diff = diffScanOutputs(prev, {
        result,
        findingTypes: derived.map((d) => d.type),
      });
      await db
        .update(scans)
        .set({ diff: JSON.stringify(diff) })
        .where(eq(scans.id, scan.id));
    }

    // the scan that just finished is the only moment the table can cross the
    // retention bound, so this is where the prune runs. best effort and
    // wrapped on purpose: the scan is already recorded as done, a failed
    // prune must not rewrite it as failed.
    try {
      await pruneDoneScans(target.id);
    } catch {
      // retention retries on the next completed scan
    }
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
