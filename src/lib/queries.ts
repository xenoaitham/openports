import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { findings, scans, targets } from "@/db/schema";
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
import type { ScanResult } from "./scan-types";

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
  try {
    // resolve before anything is stored: dead domains and internal addresses
    // fail here, loudly, instead of in a scan later
    await resolvePublicHost(domain);
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
  await db
    .update(targets)
    .set({ status: "failed", failReason: result.reason ?? "verification failed" })
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
  if (!result) return [];
  try {
    const parsed = JSON.parse(result) as ScanResult;
    return parsed.ports?.open ?? [];
  } catch {
    return [];
  }
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
    .select({ scanId: findings.scanId })
    .from(findings)
    .where(eq(findings.targetId, id));
  const countByScan = new Map<number, number>();
  for (const row of countRows) {
    countByScan.set(row.scanId, (countByScan.get(row.scanId) ?? 0) + 1);
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
    if (latestDone.result) {
      try {
        rawResult = JSON.parse(latestDone.result) as ScanResult;
      } catch {
        rawResult = null;
      }
    }
  }

  return {
    target: serializeTarget(target),
    scans: scanViews,
    findings: findingViews,
    rawResult,
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
    });
  }
  return out;
}

export async function getTargetDetailJson(id: number): Promise<TargetDetail | null> {
  return getTargetDetail(id);
}
