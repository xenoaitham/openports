import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { scans, targets } from "../src/db/schema";
import { claimOneScan, claimWhere, failInterruptedScans } from "../src/lib/claim";

// the claim is the one piece of the worker that two runners touch at once,
// so it is pinned three ways: the generated sql is pinned by shape, the
// behavior is pinned against an in-memory database, and one test races two
// real processes over a shared file database.

// static ddl matching src/db/schema.ts, no parameters anywhere
const DDL = [
  "CREATE TABLE targets (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  domain TEXT NOT NULL UNIQUE,",
  "  status TEXT NOT NULL DEFAULT 'pending',",
  "  verify_token TEXT NOT NULL,",
  "  fail_reason TEXT,",
  "  ip TEXT,",
  "  verified_at INTEGER,",
  "  created_at INTEGER NOT NULL",
  ");",
  "CREATE TABLE scans (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,",
  "  status TEXT NOT NULL DEFAULT 'queued',",
  "  error TEXT,",
  "  result TEXT,",
  "  diff TEXT,",
  "  started_at INTEGER,",
  "  finished_at INTEGER,",
  "  created_at INTEGER NOT NULL",
  ");",
].join("\n");

function makeDb(file = ":memory:") {
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  for (const statement of DDL.split(";")) {
    if (statement.trim()) sqlite.prepare(statement).run();
  }
  return db;
}

type Db = ReturnType<typeof makeDb>;

let nextDomain = 0;
async function addTarget(db: Db, ip: string | null): Promise<number> {
  const [row] = await db
    .insert(targets)
    .values({ domain: `t${nextDomain}.example.com`, verifyToken: "x", ip })
    .returning({ id: targets.id });
  nextDomain += 1;
  return row.id;
}

function addQueued(db: Db, targetId: number) {
  return db.insert(scans).values({ targetId, status: "queued" }).returning({ id: scans.id });
}

async function setStatus(db: Db, scanId: number, status: "queued" | "running" | "done" | "failed") {
  await db.update(scans).set({ status }).where(eq(scans.id, scanId));
}

test("the claim statement is pinned by shape: one update, polite, oldest first", () => {
  const db = drizzle(new Database(":memory:"), { schema });
  const sql = db
    .update(scans)
    .set({ status: "running", startedAt: new Date() })
    .where(claimWhere)
    .returning()
    .toSQL().sql;
  // the outer recheck: a row that lost a race updates nothing
  assert.ok(sql.includes(`"scans"."status" = ?`), sql);
  // the candidate row is picked inside the same statement
  assert.ok(sql.includes("scans.id = ("), sql);
  assert.ok(sql.includes("SELECT s.id FROM scans s"), sql);
  assert.ok(sql.includes("JOIN targets st ON st.id = s.target_id"), sql);
  // politeness: same target, and same stored address across targets
  assert.ok(sql.includes("NOT EXISTS ("), sql);
  assert.ok(sql.includes("busy.target_id = s.target_id"), sql);
  assert.ok(sql.includes("bt.ip IS NOT NULL AND bt.ip = st.ip"), sql);
  // oldest first, one row
  assert.ok(sql.includes("ORDER BY s.id"), sql);
  assert.ok(sql.includes("LIMIT 1"), sql);
});

test("every row is claimed exactly once, then nothing is left", async () => {
  const db = makeDb();
  const a = await addTarget(db, "10.0.0.1");
  const b = await addTarget(db, "10.0.0.2");
  const ids = [
    (await addQueued(db, a))[0].id,
    (await addQueued(db, b))[0].id,
    (await addQueued(db, a))[0].id,
  ];
  // claim, finish, claim again: the loop a worker runs, politely
  const claimed: number[] = [];
  for (;;) {
    const row = await claimOneScan(db);
    if (!row) break;
    claimed.push(row.id);
    assert.equal(row.status, "running");
    assert.ok(row.startedAt, "the claim stamps the start");
    await setStatus(db, row.id, "done");
  }
  assert.deepEqual(claimed.sort((x, y) => x - y), ids);
  assert.equal(await claimOneScan(db), null);
  const rows = await db.select().from(scans);
  assert.deepEqual(
    rows.map((r) => r.status).sort(),
    ["done", "done", "done"],
  );
});

test("concurrent claims never take one row", async () => {
  const db = makeDb();
  const a = await addTarget(db, "10.0.0.1");
  const b = await addTarget(db, "10.0.0.2");
  const c = await addTarget(db, "10.0.0.3");
  const ids = [
    (await addQueued(db, a))[0].id,
    (await addQueued(db, b))[0].id,
    (await addQueued(db, c))[0].id,
  ];
  // four claimants against three rows: exactly three wins, all distinct,
  // and the loser walks away with null instead of a second claim
  const settled = await Promise.all(
    Array.from({ length: 4 }, () => claimOneScan(db)),
  );
  const won = settled.filter((s) => s !== null).map((s) => (s as { id: number }).id);
  assert.equal(won.length, 3);
  assert.equal(new Set(won).size, 3);
  assert.deepEqual(won.sort((x, y) => x - y), ids);
});

test("a queued scan waits while its own target is running", async () => {
  const db = makeDb();
  const a = await addTarget(db, "10.0.0.1");
  const first = (await addQueued(db, a))[0].id;
  const second = (await addQueued(db, a))[0].id;

  const claim = await claimOneScan(db);
  assert.equal(claim?.id, first);
  // the second row is held back: one target is never swept from two workers
  assert.equal(await claimOneScan(db), null);

  await setStatus(db, first, "done");
  const next = await claimOneScan(db);
  assert.equal(next?.id, second);
  assert.equal(await claimOneScan(db), null);
});

test("a target on a shared address waits for the other name on the same host", async () => {
  const db = makeDb();
  // two names, one host, plus an unrelated host
  const apex = await addTarget(db, "10.0.0.7");
  const www = await addTarget(db, "10.0.0.7");
  const other = await addTarget(db, "10.0.0.8");
  const apexScan = (await addQueued(db, apex))[0].id;
  const wwwScan = (await addQueued(db, www))[0].id;
  const otherScan = (await addQueued(db, other))[0].id;

  const claim = await claimOneScan(db);
  assert.equal(claim?.id, apexScan);
  // www.example.com shares the address: it waits, the unrelated host does not
  const second = await claimOneScan(db);
  assert.equal(second?.id, otherScan);
  assert.equal(await claimOneScan(db), null);

  await setStatus(db, apexScan, "done");
  const third = await claimOneScan(db);
  assert.equal(third?.id, wwwScan);
});

test("across targets the queue is oldest first", async () => {
  const db = makeDb();
  const a = await addTarget(db, "10.0.0.1");
  const b = await addTarget(db, "10.0.0.2");
  const c = await addTarget(db, "10.0.0.3");
  const ids = [
    (await addQueued(db, b))[0].id,
    (await addQueued(db, a))[0].id,
    (await addQueued(db, c))[0].id,
  ];
  for (const id of ids) {
    const claim = await claimOneScan(db);
    assert.equal(claim?.id, id);
    await setStatus(db, id, "done");
  }
  assert.equal(await claimOneScan(db), null);
});

test("two processes racing over one file database never claim the same row", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openports-claim-"));
  const file = path.join(dir, "claim.db");
  const db = makeDb(file);
  db.$client.pragma("journal_mode = WAL");

  const targetIds: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    targetIds.push(await addTarget(db, `10.1.${i}.1`));
  }
  const ids: number[] = [];
  for (const t of targetIds) {
    ids.push((await addQueued(db, t))[0].id);
  }

  // two fresh processes, each looping the real claim until it comes up empty
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cli = path.join(here, "..", "node_modules", "tsx", "dist", "cli.mjs");
  const child = path.join(here, "claim-race-child.ts");
  const run = () =>
    new Promise<number[]>((resolve, reject) => {
      const proc = spawn(process.execPath, [cli, child, file], {
        stdio: ["ignore", "pipe", "inherit"],
      });
      let out = "";
      proc.stdout.on("data", (chunk) => (out += chunk));
      proc.on("exit", (code) =>
        code === 0
          ? resolve(JSON.parse(out.trim()))
          : reject(new Error(`race child exited ${code}`)),
      );
    });

  const [first, second] = await Promise.all([run(), run()]);
  const all = [...first, ...second].sort((x, y) => x - y);
  assert.equal(new Set(all).size, all.length, "a row was claimed twice");
  assert.deepEqual(all, ids);

  const rows = await db
    .select({ status: scans.status })
    .from(scans)
    .where(inArray(scans.id, ids));
  assert.deepEqual(
    rows.map((r) => r.status).sort(),
    ids.map(() => "running"),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("boot recovery fails every running row and touches nothing else", async () => {
  const db = makeDb();
  // several running rows at once is the pool shape: one per target the pool
  // had in flight when the process died
  const a = await addTarget(db, "10.0.0.1");
  const b = await addTarget(db, "10.0.0.2");
  const c = await addTarget(db, "10.0.0.3");
  const runningIds = [
    (await addQueued(db, a))[0].id,
    (await addQueued(db, b))[0].id,
    (await addQueued(db, c))[0].id,
  ];
  for (const id of runningIds) await setStatus(db, id, "running");
  const queued = (await addQueued(db, a))[0].id;

  await failInterruptedScans(db);

  const rows = await db
    .select()
    .from(scans)
    .where(inArray(scans.id, [...runningIds, queued]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of runningIds) {
    assert.equal(byId.get(id)?.status, "failed");
    assert.equal(
      byId.get(id)?.error,
      "scan interrupted: the server restarted before it finished",
    );
    assert.ok(byId.get(id)?.finishedAt, "the boot stamps the finish");
  }
  assert.equal(byId.get(queued)?.status, "queued");
});
