import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { findings, scans, targets, type ScanRow, type TargetRow } from "@/db/schema";
import { runScanChecks } from "./scanner";
import { evaluateScanResult } from "./evaluate";
import { diffScanOutputs, type DiffInput } from "./diff";
import { isPreallowed } from "./host";
import { pruneDoneScans } from "./retention";
import { rescanDue, schedulerFields } from "./schedule";
import { claimOneScan } from "./claim";
import type { ScanResult } from "./scan-types";

// a small worker pool: up to WORKER_POOL_SIZE scans run at once. three,
// because a small company watching a handful of domains wants a manual
// burst to clear quickly, and the claim in claim.ts keeps one host from
// ever being swept twice, so the cap only ever fans out across different
// hosts. one plain constant like the cadence, no settings surface.
export const WORKER_POOL_SIZE = 3;

// the pool state lives on globals so next dev hot reloads do not start a
// second set of loops and run scans twice.
type WorkerGlobal = typeof globalThis & {
  __openportsTimer?: NodeJS.Timeout;
  __openportsWorkers?: number;
  __openportsPassing?: boolean;
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
  pump();
}

// start a loop for every free slot. each loop claims in a tight cycle and
// exits when nothing claimable is left; the interval tops the pool back up
// two seconds later at the latest. the counter moves synchronously at loop
// start, so overlapping pumps cannot overshoot the cap.
function pump() {
  const free = WORKER_POOL_SIZE - (g.__openportsWorkers ?? 0);
  for (let i = 0; i < free; i += 1) void workerLoop();
}

async function workerLoop() {
  g.__openportsWorkers = (g.__openportsWorkers ?? 0) + 1;
  try {
    for (;;) {
      const scan = await claimOneScan(db);
      if (!scan) break;
      const [target] = await db
        .select()
        .from(targets)
        .where(eq(targets.id, scan.targetId))
        .limit(1);
      if (target) await runOne(scan, target);
    }
  } finally {
    g.__openportsWorkers = (g.__openportsWorkers ?? 0) - 1;
  }
}

async function tick() {
  // one scheduler pass at a time, so two overlapping ticks cannot both read
  // a target as idle and queue it twice. a pass that is still running only
  // skips the pass; the pump still runs.
  if (!g.__openportsPassing) {
    g.__openportsPassing = true;
    try {
      await enqueueDueRescans();
    } finally {
      g.__openportsPassing = false;
    }
  }
  pump();
}

// the scheduled pass over verified targets. a target is due when its newest
// finished scan of any status is older than the cadence, or when it has
// none. a target that already has a queued or running scan is skipped, so a
// scheduled rescan never piles up behind a scan that has not run yet; once
// that scan lands, its finish time resets the cadence and the next tick
// sees the target as quiet.
async function enqueueDueRescans() {
  const rows = await db
    .select(schedulerFields)
    .from(targets)
    .where(eq(targets.status, "verified"));
  const now = Date.now();
  for (const row of rows) {
    if (row.active) continue;
    if (!rescanDue(row.lastAttemptAt ?? null, now)) continue;
    await db.insert(scans).values({ targetId: row.id, status: "queued" });
  }
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

async function runOne(scan: ScanRow, target: TargetRow) {
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

    // keep the politeness address current: the next claim matches targets
    // that resolve to the same address against this one.
    const ip = result.addresses?.[0];
    if (ip && ip !== target.ip) {
      await db.update(targets).set({ ip }).where(eq(targets.id, target.id));
    }

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
