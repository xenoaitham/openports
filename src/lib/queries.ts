import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { findings, scans, targets } from "@/db/schema";
import { severityRank } from "./catalog";
import {
  changesForScans,
  diffIsEmpty,
  storedDiffHasChanges,
} from "./diff";
import { isPreallowed, normalizeDomain, resolvePublicHost } from "./host";
import { generateToken, checkTxtRecord } from "./verify";
import { enqueueScan } from "./worker";
import type {
  FindingView,
  ScanView,
  TargetDetail,
  TargetOverview,
  TargetView,
} from "./view-types";
import { parseScanResult, type ScanResult } from "./scan-types";

export type CreateResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function createTarget(input: string): Promise<CreateResult> {
  const domain = normalizeDomain(input);
  if (!domain) {
    return { ok: false, error: "that does not look like a domain name" };
  }
  const existing = await db
    .select({ id: targets.id })
    .from(targets)
    .where(eq(targets.domain, domain))
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: `${domain} is already on the list` };
  }
  let addresses: string[] = [];
  try {
    // resolve before anything is stored: dead domains and internal addresses
    // fail here, loudly, instead of in a scan later. the address is stored
    // so the worker's claim can keep two names on one host from being swept
    // at the same time.
    addresses = await resolvePublicHost(domain);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const preallowed = isPreallowed(domain);
  const [row] = await db
    .insert(targets)
    .values({
      domain,
      verifyToken: generateToken(),
      status: preallowed ? "verified" : "pending",
      verifiedAt: preallowed ? new Date() : null,
      ip: addresses[0],
    })
    .returning({ id: targets.id });

  if (preallowed) {
    await enqueueScan(row.id);
  }
  return { ok: true, id: row.id };
}

export type VerifyResult =
  | { ok: true; status: "verified" }
  | { ok: false; error: string };

export async function verifyTarget(id: number): Promise<VerifyResult> {
  const [target] = await db
    .select()
    .from(targets)
    .where(eq(targets.id, id))
    .limit(1);
  if (!target) return { ok: false, error: "target not found" };
  if (target.status === "verified") return { ok: true, status: "verified" };

  const result = await checkTxtRecord(target.domain, target.verifyToken);
  if (result.ok) {
    await db
      .update(targets)
      .set({ status: "verified", verifiedAt: new Date(), failReason: null })
      .where(eq(targets.id, id));
    await enqueueScan(id);
    return { ok: true, status: "verified" };
  }
  // the target stays pending: not having published the record yet is the
  // normal state, not a failure. the reason is kept for the verify panel.
  await db
    .update(targets)
    .set({ failReason: result.reason ?? "verification failed" })
    .where(eq(targets.id, id));
  return { ok: false, error: result.reason ?? "verification failed" };
}

export async function rescanTarget(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [target] = await db
    .select()
    .from(targets)
    .where(eq(targets.id, id))
    .limit(1);
  if (!target) return { ok: false, error: "target not found" };
  if (target.status !== "verified" && !isPreallowed(target.domain)) {
    return { ok: false, error: "verify ownership before scanning" };
  }
  await enqueueScan(id);
  return { ok: true };
}

export async function deleteTarget(id: number): Promise<void> {
  await db.delete(targets).where(eq(targets.id, id));
}

function serializeTarget(t: typeof targets.$inferSelect): TargetView {
  return {
    id: t.id,
    domain: t.domain,
    status: t.status,
    failReason: t.failReason,
    verifyToken: t.verifyToken,
    demo: isPreallowed(t.domain),
    createdAt: t.createdAt.toISOString(),
    verifiedAt: t.verifiedAt ? t.verifiedAt.toISOString() : null,
  };
}

function parsePorts(result: string | null): number[] {
  return parseScanResult(result)?.ports?.open ?? [];
}

export async function getTargetDetail(id: number): Promise<TargetDetail | null> {
  const [target] = await db
    .select()
    .from(targets)
    .where(eq(targets.id, id))
    .limit(1);
  if (!target) return null;

  const scanRows = await db
    .select()
    .from(scans)
    .where(eq(scans.targetId, id))
    .orderBy(desc(scans.id))
    .limit(20);

  const doneScans = scanRows.filter((s) => s.status === "done");
  const latestDone = doneScans[0] ?? null;

  const scanViews: ScanView[] = scanRows.map((s) => ({
    id: s.id,
    status: s.status,
    error: s.error,
    startedAt: s.startedAt ? s.startedAt.toISOString() : null,
    finishedAt: s.finishedAt ? s.finishedAt.toISOString() : null,
    durationMs:
      s.startedAt && s.finishedAt
        ? s.finishedAt.getTime() - s.startedAt.getTime()
        : null,
    openPorts: parsePorts(s.result),
    findingCount: 0,
  }));

  const countRows = await db
    .select({ scanId: findings.scanId, type: findings.type })
    .from(findings)
    .where(eq(findings.targetId, id));
  const countByScan = new Map<number, number>();
  const typesByScan = new Map<number, string[]>();
  for (const row of countRows) {
    countByScan.set(row.scanId, (countByScan.get(row.scanId) ?? 0) + 1);
    typesByScan.set(row.scanId, [...(typesByScan.get(row.scanId) ?? []), row.type]);
  }
  for (const sv of scanViews) {
    sv.findingCount = countByScan.get(sv.id) ?? 0;
  }

  let findingViews: FindingView[] = [];
  let rawResult: ScanResult | null = null;
  if (latestDone) {
    const rows = await db
      .select()
      .from(findings)
      .where(eq(findings.scanId, latestDone.id))
      .orderBy(desc(findings.id));
    findingViews = rows.map((f) => {
      let evidence: Record<string, unknown> = {};
      try {
        evidence = f.evidence ? (JSON.parse(f.evidence) as Record<string, unknown>) : {};
      } catch {
        evidence = {};
      }
      return { id: f.id, type: f.type, severity: f.severity, evidence };
    });
    // worst first: the report reads top down
    findingViews.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.id - b.id,
    );
    rawResult = parseScanResult(latestDone.result);
  }

  // changes feed: latest done scan vs the one before, labeled with
  // hysteresis from the scan before that. same recompute as the cross
  // target feed on the dashboard.
  const changes = changesForScans(doneScans.slice(0, 3), typesByScan);

  return {
    target: serializeTarget(target),
    scans: scanViews,
    findings: findingViews,
    rawResult,
    changes,
  };
}

export async function listTargetOverviews(): Promise<TargetOverview[]> {
  const targetRows = await db.select().from(targets).orderBy(desc(targets.id));
  const out: TargetOverview[] = [];

  for (const t of targetRows) {
    const [lastScan] = await db
      .select()
      .from(scans)
      .where(eq(scans.targetId, t.id))
      .orderBy(desc(scans.id))
      .limit(1);
    const [lastDone] = await db
      .select()
      .from(scans)
      .where(eq(scans.targetId, t.id))
      .orderBy(desc(scans.id))
      .limit(20)
      .then((rows) => rows.filter((r) => r.status === "done"));

    let counts = { high: 0, medium: 0, low: 0, info: 0 };
    if (lastDone) {
      const rows = await db
        .select({ severity: findings.severity })
        .from(findings)
        .where(eq(findings.scanId, lastDone.id));
      for (const r of rows) counts[r.severity] += 1;
    }

    // when this target last changed, straight off the stored audit trail.
    // the walk back is bounded; beyond it the column falls back to "-"
    const diffRows = await db
      .select({ finishedAt: scans.finishedAt, diff: scans.diff })
      .from(scans)
      .where(and(eq(scans.targetId, t.id), isNotNull(scans.diff)))
      .orderBy(desc(scans.id))
      .limit(500);
    const lastChange = diffRows.find((r) => storedDiffHasChanges(r.diff));

    out.push({
      id: t.id,
      domain: t.domain,
      status: t.status,
      failReason: t.failReason,
      createdAt: t.createdAt.toISOString(),
      lastScan: lastScan
        ? {
            id: lastScan.id,
            status: lastScan.status,
            startedAt: lastScan.startedAt ? lastScan.startedAt.toISOString() : null,
            finishedAt: lastScan.finishedAt
              ? lastScan.finishedAt.toISOString()
              : null,
          }
        : null,
      counts,
      openPorts: parsePorts(lastDone?.result ?? lastScan?.result ?? null),
      lastChangeAt: lastChange?.finishedAt
        ? lastChange.finishedAt.toISOString()
        : null,
    });
  }
  return out;
}

export interface ChangeEntry {
  targetId: number;
  domain: string;
  // when the scan that recorded the change finished
  finishedAt: string | null;
  changes: NonNullable<TargetDetail["changes"]>;
}

export interface RecentChanges {
  entries: ChangeEntry[];
  // targets that actually have two done scans to compare
  comparedTargets: number;
}

// the cross target changes feed: every target contributes the diff of its
// newest done scan, recomputed exactly like the target page recomputes it,
// so the two feeds cannot disagree. a target whose latest scan changed
// nothing contributes nothing; older changes stay on the scan rows as the
// audit trail.
export async function listRecentChanges(): Promise<RecentChanges> {
  const targetRows = await db
    .select({ id: targets.id, domain: targets.domain })
    .from(targets)
    .orderBy(desc(targets.id));

  const perTarget = new Map<number, (typeof scans.$inferSelect)[]>();
  const scanIds: number[] = [];
  let comparedTargets = 0;
  for (const t of targetRows) {
    const doneRows = await db
      .select()
      .from(scans)
      .where(and(eq(scans.targetId, t.id), eq(scans.status, "done")))
      .orderBy(desc(scans.id))
      .limit(3);
    if (doneRows.length >= 2) comparedTargets += 1;
    perTarget.set(t.id, doneRows);
    scanIds.push(...doneRows.map((r) => r.id));
  }

  const typeRows = scanIds.length
    ? await db
        .select({ scanId: findings.scanId, type: findings.type })
        .from(findings)
        .where(inArray(findings.scanId, scanIds))
    : [];
  const typesByScan = new Map<number, string[]>();
  for (const row of typeRows) {
    typesByScan.set(row.scanId, [...(typesByScan.get(row.scanId) ?? []), row.type]);
  }

  const entries: ChangeEntry[] = [];
  for (const t of targetRows) {
    const doneRows = perTarget.get(t.id) ?? [];
    const changes = changesForScans(doneRows, typesByScan);
    if (!changes || diffIsEmpty(changes.diff)) continue;
    const finished = doneRows[0].finishedAt;
    entries.push({
      targetId: t.id,
      domain: t.domain,
      finishedAt: finished ? finished.toISOString() : null,
      changes,
    });
  }
  entries.sort((a, b) => {
    const ta = a.finishedAt ? Date.parse(a.finishedAt) : 0;
    const tb = b.finishedAt ? Date.parse(b.finishedAt) : 0;
    return tb - ta;
  });
  return { entries, comparedTargets };
}

export async function getTargetDetailJson(id: number): Promise<TargetDetail | null> {
  return getTargetDetail(id);
}

// the latest finished scan on this instance, for the landing page. real data
// or nothing: when no scan has run yet the landing says so instead of
// decorating.
export interface LandingReport {
  domain: string;
  finishedAt: string | null;
  durationMs: number | null;
  openPorts: number[];
  findings: FindingView[];
}

export async function getLandingReport(): Promise<LandingReport | null> {
  const [row] = await db
    .select({ scan: scans, domain: targets.domain })
    .from(scans)
    .innerJoin(targets, eq(scans.targetId, targets.id))
    .where(eq(scans.status, "done"))
    .orderBy(desc(scans.id))
    .limit(1);
  if (!row) return null;

  const findingRows = await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, row.scan.id));
  const reportFindings: FindingView[] = findingRows.map((f) => {
    let evidence: Record<string, unknown> = {};
    try {
      evidence = f.evidence ? (JSON.parse(f.evidence) as Record<string, unknown>) : {};
    } catch {
      evidence = {};
    }
    return { id: f.id, type: f.type, severity: f.severity, evidence };
  });
  reportFindings.sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.id - b.id,
  );

  return {
    domain: row.domain,
    finishedAt: row.scan.finishedAt ? row.scan.finishedAt.toISOString() : null,
    durationMs:
      row.scan.startedAt && row.scan.finishedAt
        ? row.scan.finishedAt.getTime() - row.scan.startedAt.getTime()
        : null,
    openPorts: parsePorts(row.scan.result),
    findings: reportFindings,
  };
}
