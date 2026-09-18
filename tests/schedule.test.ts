import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { targets } from "../src/db/schema";
import {
  RESCAN_INTERVAL_MS,
  rescanDue,
  schedulerFields,
} from "../src/lib/schedule";

const NOW = 1_800_000_000_000;

test("a target with no done scan is due immediately", () => {
  assert.equal(rescanDue(null, NOW), true);
});

test("a scan inside the cadence keeps the target quiet", () => {
  assert.equal(rescanDue(NOW - RESCAN_INTERVAL_MS + 60_000, NOW), false);
  assert.equal(rescanDue(NOW - 60_000, NOW), false);
});

test("a scan older than the cadence makes the target due", () => {
  assert.equal(rescanDue(NOW - RESCAN_INTERVAL_MS, NOW), true);
  assert.equal(rescanDue(NOW - RESCAN_INTERVAL_MS - 60_000, NOW), true);
});

test("the scheduler subqueries correlate on the outer target, not on scans", () => {
  // drizzle renders an interpolated column object unqualified, and inside a
  // subquery a bare "id" resolves to scans.id. that once compared every scan
  // against itself, read a stale cadence and rescanned in a loop.
  const testDb = drizzle(new Database(":memory:"), { schema });
  const sql = testDb
    .select(schedulerFields)
    .from(targets)
    .where(eq(targets.status, "verified"))
    .toSQL().sql;
  assert.ok(sql.includes("scans.target_id = targets.id"), sql);
  assert.ok(!/"target_id" = "id"/.test(sql), sql);
});
