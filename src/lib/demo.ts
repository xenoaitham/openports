import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Database } from "better-sqlite3";
import type * as schema from "@/db/schema";
import { RESCAN_INTERVAL_MS } from "./schedule";
import { generateToken } from "./verify";

type Db = BetterSQLite3Database<typeof schema> & { $client: Database };

export const DEMO_DOMAIN = "scanme.nmap.org";
export const DEMO_READ_ONLY_MESSAGE = "The public demo does not allow target changes.";

export function isPublicDemo(): boolean {
  return process.env.OPENPORTS_DEMO_MODE === "1";
}

export type EnqueueResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterSeconds?: number };

// Use a dedicated database. Refuse pre-existing targets or a scan backlog.
export function prepareDemoTarget(db: Db, now = Date.now()): number {
  return db.$client.transaction(() => {
    const foreign = db.$client.prepare("SELECT id FROM targets WHERE domain <> ? LIMIT 1").get(DEMO_DOMAIN);
    if (foreign) throw new Error("Public demo requires a dedicated database containing only scanme.nmap.org.");
    const active = db.$client.prepare("SELECT count(*) AS count FROM scans WHERE status IN ('queued', 'running')").get() as { count: number };
    if (active.count > 1) throw new Error("Public demo refuses an existing scan backlog.");
    const queued = db.$client.prepare("SELECT id FROM scans WHERE status = 'queued' LIMIT 1").get() as { id: number } | undefined;
    if (queued) {
      const recent = db.$client.prepare(`SELECT id FROM scans WHERE id <> ? AND
        max(created_at, coalesce(started_at, 0), coalesce(finished_at, 0)) > ? LIMIT 1`)
        .get(queued.id, now - RESCAN_INTERVAL_MS);
      if (recent) throw new Error("Public demo refuses a queued scan inside the cooldown.");
    }
    db.$client.prepare(`INSERT INTO targets (domain, status, verify_token, verified_at, created_at)
      VALUES (?, 'verified', ?, ?, ?) ON CONFLICT(domain) DO NOTHING`)
      .run(DEMO_DOMAIN, generateToken(), now, now);
    const target = db.$client.prepare("SELECT id, status FROM targets WHERE domain = ?").get(DEMO_DOMAIN) as { id: number; status: string };
    if (target.status !== "verified") throw new Error("Public demo target must be verified.");
    return target.id;
  }).immediate();
}

// One write statement admits a scan across requests, processes, and restarts.
export function admitDemoScan(db: Db, targetId: number, now = Date.now()): EnqueueResult {
  const target = db.$client.prepare("SELECT domain, status FROM targets WHERE id = ?").get(targetId) as { domain: string; status: string } | undefined;
  if (!target || target.domain !== DEMO_DOMAIN || target.status !== "verified") {
    return { ok: false, error: "The public demo only scans scanme.nmap.org." };
  }
  const row = db.$client.prepare(`INSERT INTO scans (target_id, status, created_at)
    SELECT id, 'queued', ? FROM targets
    WHERE id = ? AND domain = ? AND status = 'verified'
      AND NOT EXISTS (SELECT 1 FROM scans WHERE status IN ('queued', 'running'))
      AND NOT EXISTS (SELECT 1 FROM scans WHERE
        max(created_at, coalesce(started_at, 0), coalesce(finished_at, 0)) > ?)
    RETURNING id`).get(now, targetId, DEMO_DOMAIN, now - RESCAN_INTERVAL_MS);
  if (row) return { ok: true };
  const last = db.$client.prepare(`SELECT max(max(created_at, coalesce(started_at, 0), coalesce(finished_at, 0))) AS at FROM scans`).get() as { at: number | null };
  return {
    ok: false,
    error: "The shared demo allows one scan every six hours. A scan is already active or cooling down.",
    retryAfterSeconds: Math.max(1, Math.ceil(((last.at ?? now) + RESCAN_INTERVAL_MS - now) / 1000)),
  };
}
