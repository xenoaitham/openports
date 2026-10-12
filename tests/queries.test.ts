import { test } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { ScanResult } from "../src/lib/scan-types";

test("reports keep finding order, evidence fallback, and bounded history", async () => {
  // Import after setting DB_PATH so this test never opens the application database.
  process.env.DB_PATH = ":memory:";
  const { db } = await import("../src/db");
  const { targets, scans, findings } = await import("../src/db/schema");
  const { getTargetDetail, getLandingReport, listTargetOverviews } = await import("../src/lib/queries");
  migrate(db, { migrationsFolder: "drizzle" });

  assert.equal(await getLandingReport(), null);
  assert.equal(await getTargetDetail(999), null);
  const [target] = await db.insert(targets).values({
    domain: "example.com", verifyToken: "test-token",
  }).returning();
  const [empty] = await db.insert(targets).values({
    domain: "empty.example.com", verifyToken: "empty-token",
  }).returning();
  assert.deepEqual((await getTargetDetail(empty.id))?.scans, []);

  const result: ScanResult = {
    host: target.domain, addresses: ["93.184.216.34"],
    ports: { scanned: 100, open: [80, 443], refused: 98, filtered: 0, durationMs: 250 },
    tls: [], dns: { spf: null, dmarc: null, mx: [] },
    http: { port80Open: true, httpsOk: false }, banners: [],
  };
  const startedAt = new Date("2026-10-13T12:00:00Z");
  const finishedAt = new Date("2026-10-13T12:00:02Z");
  const [scan] = await db.insert(scans).values({
    targetId: target.id, status: "done", result: JSON.stringify(result),
    startedAt, finishedAt,
  }).returning();
  await db.insert(findings).values([
    { targetId: target.id, scanId: scan.id, type: "missing_hsts", severity: "low", evidence: "{" },
    { targetId: target.id, scanId: scan.id, type: "dmarc_missing", severity: "high", evidence: '{"record":"absent"}' },
    { targetId: target.id, scanId: scan.id, type: "tls_cert_expired", severity: "high", evidence: null },
  ]);

  const detail = await getTargetDetail(target.id);
  const landing = await getLandingReport();
  assert.deepEqual(detail?.findings, landing?.findings);
  assert.deepEqual(detail?.findings.map((finding) => finding.type), [
    "dmarc_missing", "tls_cert_expired", "missing_hsts",
  ]);
  assert.deepEqual(detail?.findings.map((finding) => finding.evidence), [
    { record: "absent" }, {}, {},
  ]);
  assert.equal(detail?.scans[0].findingCount, 3);
  assert.equal(detail?.scans[0].durationMs, 2000);
  assert.equal(landing?.durationMs, 2000);
  assert.deepEqual(landing?.openPorts, [80, 443]);

  const overview = (await listTargetOverviews()).find((row) => row.id === target.id);
  assert.deepEqual(overview?.counts, { high: 2, medium: 0, low: 1, info: 0 });
  assert.deepEqual(overview?.openPorts, [80, 443]);

  // A completed scan outside the latest 20 rows must not become the overview result.
  await db.insert(scans).values(Array.from({ length: 20 }, () => ({
    targetId: target.id, status: "failed" as const, result: "{", finishedAt,
  })));
  const bounded = (await listTargetOverviews()).find((row) => row.id === target.id);
  assert.equal(bounded?.lastScan?.status, "failed");
  assert.deepEqual(bounded?.counts, { high: 0, medium: 0, low: 0, info: 0 });
  assert.deepEqual(bounded?.openPorts, []);
  assert.deepEqual((await getTargetDetail(target.id))?.findings, []);
});
