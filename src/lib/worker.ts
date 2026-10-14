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
import { parseScanResult } from "./scan-types";
import { admitDemoScan, DEMO_DOMAIN, isPublicDemo, type EnqueueResult } from "./demo";

// Claims prevent concurrent scans of the same host; the pool serves different hosts.
export const WORKER_POOL_SIZE = 3;

// Keep one pool across Next.js development hot reloads.
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

export async function enqueueScan(targetId: number): Promise<EnqueueResult> {
  if (isPublicDemo()) {
    const result = admitDemoScan(db, targetId);
    if (!result.ok) return result;
  } else {
    await db.insert(scans).values({ targetId, status: "queued" });
  }
  ensureWorker();
  pump();
  return { ok: true };
}

// Each loop increments the counter before awaiting, keeping overlapping pumps bounded.
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
  // Serialize scheduler passes to avoid queuing the same idle target twice.
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

// Skip active targets. Completed and failed attempts both reset the six-hour interval.
async function enqueueDueRescans() {
  const rows = await db
    .select(schedulerFields)
    .from(targets)
    .where(eq(targets.status, "verified"));
  const now = Date.now();
  for (const row of rows) {
    if (row.active) continue;
    if (!rescanDue(row.lastAttemptAt ?? null, now)) continue;
    await enqueueScan(row.id);
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
  return {
    result: parseScanResult(row.result),
    findingTypes: types.map((finding) => finding.type),
  };
}

async function runOne(scan: ScanRow, target: TargetRow) {
  try {
    if (isPublicDemo() && target.domain !== DEMO_DOMAIN) {
      throw new Error("The public demo only scans scanme.nmap.org.");
    }
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
