import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RETAIN_DONE_SCANS,
  doneScanIdsToDelete,
} from "../src/lib/retention";

test("a target inside the bound keeps every done scan", () => {
  assert.deepEqual(doneScanIdsToDelete([3, 2, 1]), []);
  assert.deepEqual(doneScanIdsToDelete([]), []);
});

test("a target past the bound loses the oldest done scans, newest first", () => {
  const ids = Array.from({ length: RETAIN_DONE_SCANS + 5 }, (_, i) => 105 - i);
  assert.deepEqual(doneScanIdsToDelete(ids), [5, 4, 3, 2, 1]);
});

test("exactly the bound deletes nothing", () => {
  const ids = Array.from({ length: RETAIN_DONE_SCANS }, (_, i) => 100 - i);
  assert.deepEqual(doneScanIdsToDelete(ids), []);
});
