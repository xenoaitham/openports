import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import * as schema from "../src/db/schema";
import { admitDemoScan, prepareDemoTarget } from "../src/lib/demo";
import { RESCAN_INTERVAL_MS } from "../src/lib/schedule";
import { failInterruptedScans } from "../src/lib/claim";

const NOW = 1_800_000_000_000;
function makeDb(file = ":memory:") {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

test("demo setup is idempotent and admits only its verified target", () => {
  const db = makeDb();
  const id = prepareDemoTarget(db, NOW);
  assert.equal(prepareDemoTarget(db, NOW), id);
  assert.equal(admitDemoScan(db, id + 1, NOW).ok, false);
  assert.equal(admitDemoScan(db, id, NOW).ok, true);
  assert.equal(admitDemoScan(db, id, NOW).ok, false);
  db.$client.close();
});

for (const status of ["queued", "running", "done", "failed"] as const) {
  test(`demo admission counts ${status} attempts`, () => {
    const db = makeDb();
    const id = prepareDemoTarget(db, NOW);
    db.insert(schema.scans).values({ targetId: id, status, createdAt: new Date(NOW - 1000) }).run();
    assert.equal(admitDemoScan(db, id, NOW).ok, false);
    if (status === "done" || status === "failed") {
      assert.equal(admitDemoScan(db, id, NOW + RESCAN_INTERVAL_MS - 1001).ok, false);
      assert.equal(admitDemoScan(db, id, NOW + RESCAN_INTERVAL_MS - 1000).ok, true);
    } else {
      assert.equal(admitDemoScan(db, id, NOW + RESCAN_INTERVAL_MS * 2).ok, false);
    }
    db.$client.close();
  });
}

test("delayed completion starts a fresh cooldown", () => {
  const db = makeDb();
  const id = prepareDemoTarget(db, NOW);
  db.insert(schema.scans).values({ targetId: id, status: "done", createdAt: new Date(NOW - RESCAN_INTERVAL_MS), startedAt: new Date(NOW - 5000), finishedAt: new Date(NOW) }).run();
  assert.equal(admitDemoScan(db, id, NOW + RESCAN_INTERVAL_MS - 1).ok, false);
  assert.equal(admitDemoScan(db, id, NOW + RESCAN_INTERVAL_MS).ok, true);
  db.$client.close();
});

test("demo refuses foreign targets and scan backlogs", () => {
  const db = makeDb();
  const id = prepareDemoTarget(db, NOW);
  db.insert(schema.targets).values({ domain: "example.com", verifyToken: "x", status: "verified" }).run();
  assert.throws(() => prepareDemoTarget(db, NOW), /dedicated database/);
  assert.equal(admitDemoScan(db, id + 1, NOW).ok, false);
  db.$client.prepare("DELETE FROM targets WHERE domain = 'example.com'").run();
  db.insert(schema.scans).values([{ targetId: id, status: "queued" }, { targetId: id, status: "queued" }]).run();
  assert.throws(() => prepareDemoTarget(db, NOW), /backlog/);
  db.$client.close();
});

test("demo refuses one queued row during a previous attempt cooldown", () => {
  const db = makeDb();
  const id = prepareDemoTarget(db, NOW);
  db.insert(schema.scans).values([{ targetId: id, status: "done", createdAt: new Date(NOW - 1000) }, { targetId: id, status: "queued", createdAt: new Date(NOW) }]).run();
  assert.throws(() => prepareDemoTarget(db, NOW), /inside the cooldown/);
  db.$client.close();
});

test("restart recovery preserves failed attempt cooldown on disk", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openports-demo-restart-"));
  try {
    const file = path.join(dir, "demo.db");
    const db = makeDb(file);
    const id = prepareDemoTarget(db);
    db.insert(schema.scans).values({ targetId: id, status: "running", createdAt: new Date(0), startedAt: new Date(0) }).run();
    db.$client.close();
    const reopened = makeDb(file);
    await failInterruptedScans(reopened);
    prepareDemoTarget(reopened);
    assert.equal(admitDemoScan(reopened, id).ok, false);
    reopened.$client.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("two processes admit exactly one demo scan", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openports-demo-race-"));
  try {
    const file = path.join(dir, "demo.db");
    const db = makeDb(file);
    const id = prepareDemoTarget(db, NOW);
    const run = () => new Promise<boolean>((resolve, reject) => {
      const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "tests/demo-race-child.ts", file, String(id), String(NOW)], { stdio: ["ignore", "pipe", "inherit"] });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; });
      child.on("error", reject);
      child.on("exit", code => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error(`Demo admission child exited ${code}`)));
    });
    const results = await Promise.all([run(), run()]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((db.$client.prepare("SELECT count(*) AS count FROM scans").get() as { count: number }).count, 1);
    db.$client.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
