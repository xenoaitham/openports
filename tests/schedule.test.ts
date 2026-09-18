import { test } from "node:test";
import assert from "node:assert/strict";
import { RESCAN_INTERVAL_MS, rescanDue } from "../src/lib/schedule";

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
