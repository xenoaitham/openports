import { test } from "node:test";
import assert from "node:assert/strict";
import { evidencePairs, formatDateTime, formatDuration, timeAgo } from "../src/lib/format";
import { parseScanResult } from "../src/lib/scan-types";

test("evidence preserves field order and keeps zero and false values", () => {
  assert.deepEqual(evidencePairs({
    missing: null,
    empty: "",
    unset: undefined,
    port: 0,
    checked: false,
    ports: [80, 443],
    expires: "2026-10-13T12:00:00Z",
    nested: ["plain", [1, 2]],
  }), [
    ["port", "0"],
    ["checked", "false"],
    ["ports", "80, 443"],
    ["expires", "2026-10-13"],
    ["nested", "plain, 1, 2"],
  ]);
});

test("duration labels preserve milliseconds, seconds, and missing values", () => {
  assert.equal(formatDuration(null), "-");
  assert.equal(formatDuration(0), "0ms");
  assert.equal(formatDuration(999), "999ms");
  assert.equal(formatDuration(1000), "1.0s");
  assert.equal(formatDuration(1560), "1.6s");
});

test("timestamps use local time and pad single-digit fields", () => {
  assert.equal(formatDateTime(null), "-");
  const localDate = new Date(2026, 0, 2, 3, 4, 5);
  assert.equal(formatDateTime(localDate.toISOString()), "2026-01-02 03:04:05");
});

test("relative time uses the existing minute, hour, and day boundaries", (context) => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  context.mock.method(Date, "now", () => now);
  const ago = (seconds: number) => timeAgo(new Date(now - seconds * 1000).toISOString());
  assert.equal(timeAgo(null), "never");
  assert.equal(ago(-10), "1s ago");
  assert.equal(ago(59), "59s ago");
  assert.equal(ago(60), "1 min ago");
  assert.equal(ago(3600), "1h ago");
  assert.equal(ago(86400), "1d ago");
});

test("stored results tolerate missing or malformed JSON", () => {
  assert.equal(parseScanResult(null), null);
  assert.equal(parseScanResult(""), null);
  assert.equal(parseScanResult("{"), null);
  assert.deepEqual(parseScanResult('{"host":"example.com"}'), { host: "example.com" });
});
