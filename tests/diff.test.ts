import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changesForScans,
  diffIsEmpty,
  diffScanOutputs,
  diffWithHysteresis,
  storedDiffHasChanges,
} from "../src/lib/diff";
import { tlsResultsOf, type ScanResult } from "../src/lib/scan-types";
import type { DiffInput } from "../src/lib/diff";

function scan(open: number[], validTo?: string, port = 443): ScanResult {
  return {
    host: "example.com",
    addresses: ["93.184.216.34"],
    ports: { scanned: 100, open, refused: 100 - open.length, filtered: 0, durationMs: 1000 },
    tls: validTo ? [{ port, checked: true, ok: true, validTo }] : [],
    dns: { spf: null, dmarc: null, mx: [] },
    http: { port80Open: open.includes(80), httpsOk: false },
    banners: [],
  };
}

function input(open: number[], types: string[] = [], validTo?: string, port = 443): DiffInput {
  return { result: scan(open, validTo, port), findingTypes: types };
}

test("ports that appear or disappear between consecutive scans are raw changes", () => {
  const diff = diffWithHysteresis(null, input([22]), input([22, 3389]));
  assert.deepEqual(diff.portsOpened.map((p) => p.port), [3389]);
  assert.deepEqual(diff.portsClosed.map((p) => p.port), []);
  assert.equal(diff.portsOpened[0].confirmed, false);
});

test("without an older baseline every change stays unconfirmed", () => {
  const diff = diffWithHysteresis(null, input([22], ["spf_missing"]), input([], ["spf_missing", "dmarc_missing"]));
  assert.equal(diff.portsClosed[0].confirmed, false);
  assert.equal(diff.findingsNew[0].confirmed, false);
});

test("a change the older baseline already saw is confirmed", () => {
  // s0: 3389 open, s1: flap, 3389 closed, s2: open again. the port
  // "appearing" at s2 is the flap reverting: two of three scans agree
  const diff = diffWithHysteresis(
    input([22, 3389]),
    input([22]),
    input([22, 3389]),
  );
  const opened = diff.portsOpened.find((p) => p.port === 3389);
  assert.equal(opened?.confirmed, true);
});

test("a first-time change stays unconfirmed even with a baseline", () => {
  // 3389 was never open before s2
  const diff = diffWithHysteresis(
    input([22]),
    input([22]),
    input([22, 3389]),
  );
  assert.equal(diff.portsOpened[0].confirmed, false);
});

test("the scanme port 80 flap pattern: closed, open, open", () => {
  // the closed reading at s1 is the flap, the reopening at s2 is confirmed
  const diff = diffWithHysteresis(
    input([22, 80]),
    input([22]),
    input([22, 80]),
  );
  assert.deepEqual(diff.portsOpened.map((p) => p.port), [80]);
  assert.equal(diff.portsOpened[0].confirmed, true);
  assert.deepEqual(diff.portsClosed, []);
});

test("finding changes carry the same confirmation logic", () => {
  // the finding existed in s0 and s1, so its disappearance at s2 is a new
  // state seen once: unconfirmed
  const firstTime = diffWithHysteresis(
    input([80, 443], ["missing_hsts"]),
    input([80, 443], ["missing_hsts"]),
    input([80, 443], []),
  );
  assert.deepEqual(firstTime.findingsResolved.map((f) => f.type), ["missing_hsts"]);
  assert.equal(firstTime.findingsResolved[0].confirmed, false);

  // s1 was the only scan carrying the finding: its resolution at s2
  // restores the older state, confirmed
  const flap = diffWithHysteresis(
    input([80, 443], []),
    input([80, 443], ["missing_hsts"]),
    input([80, 443], []),
  );
  assert.deepEqual(flap.findingsResolved.map((f) => f.type), ["missing_hsts"]);
  assert.equal(flap.findingsResolved[0].confirmed, true);
});

test("a certificate renewal is a change, identical certs are not", () => {
  const renewed = diffWithHysteresis(
    null,
    input([443], [], "2026-09-01T00:00:00.000Z"),
    input([443], [], "2026-10-01T00:00:00.000Z"),
  );
  assert.deepEqual(renewed.certExpiryChanged, [
    {
      port: 443,
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    },
  ]);

  const same = diffWithHysteresis(
    null,
    input([443], [], "2026-10-01T00:00:00.000Z"),
    input([443], [], "2026-10-01T00:00:00.000Z"),
  );
  assert.deepEqual(same.certExpiryChanged, []);

  // a missing cert on one side is a hole in the data, not a change
  const hole = diffWithHysteresis(
    null,
    input([22], []),
    input([443], [], "2026-10-01T00:00:00.000Z"),
  );
  assert.deepEqual(hole.certExpiryChanged, []);
});

test("mail port renewals are tracked per port", () => {
  const renewed = diffWithHysteresis(
    null,
    input([465], [], "2026-09-01T00:00:00.000Z", 465),
    input([465], [], "2026-10-01T00:00:00.000Z", 465),
  );
  assert.deepEqual(renewed.certExpiryChanged, [
    {
      port: 465,
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    },
  ]);
});

test("rows stored before the per port shape still diff on 443", () => {
  // the wire format used to store one object without a port
  const legacy = {
    result: {
      ...scan([443]),
      tls: { checked: true, ok: true, validTo: "2026-09-01T00:00:00.000Z" },
    } as unknown as ScanResult,
    findingTypes: [],
  };
  const renewed = diffWithHysteresis(
    legacy,
    input([443], [], "2026-10-01T00:00:00.000Z"),
    input([443], [], "2026-11-01T00:00:00.000Z"),
  );
  assert.deepEqual(
    renewed.certExpiryChanged.map((c) => c.port),
    [443],
  );
  assert.equal(tlsResultsOf(legacy.result)[0].port, 443);
});

test("diffIsEmpty reports a quiet scan", () => {
  assert.equal(
    diffIsEmpty(diffWithHysteresis(null, input([22], ["spf_missing"]), input([22], ["spf_missing"]))),
    true,
  );
  assert.equal(
    diffIsEmpty(diffWithHysteresis(null, input([22]), input([22, 80]))),
    false,
  );
});

test("changesForScans is the one recompute both feeds share", () => {
  // scan rows, newest first: the port 80 reopen at scan 3 is the scanme
  // flap reverting, so it reads confirmed. the finding set is unchanged.
  const rows = [
    { id: 3, result: JSON.stringify(scan([22, 80])), startedAt: new Date("2026-09-18T03:00:00Z") },
    { id: 2, result: JSON.stringify(scan([22])), startedAt: new Date("2026-09-18T02:00:00Z") },
    { id: 1, result: JSON.stringify(scan([22, 80])), startedAt: new Date("2026-09-18T01:00:00Z") },
  ];
  const types = new Map([
    [1, ["spf_missing"]],
    [2, ["spf_missing"]],
    [3, ["spf_missing"]],
  ]);
  const changes = changesForScans(rows, types);
  assert.equal(changes?.since, "2026-09-18T02:00:00.000Z");
  assert.deepEqual(changes?.diff.portsOpened.map((p) => p.port), [80]);
  assert.equal(changes?.diff.portsOpened[0].confirmed, true);

  // identical inputs through the direct path must produce the identical
  // diff, or the target page and the dashboard feed could disagree
  const direct = diffWithHysteresis(
    input([22, 80], ["spf_missing"]),
    input([22], ["spf_missing"]),
    input([22, 80], ["spf_missing"]),
  );
  assert.deepEqual(changes?.diff, direct);
});

test("changesForScans needs two done scans and labels without a baseline", () => {
  const types = new Map<number, string[]>();
  assert.equal(changesForScans([], types), null);
  const only = [{ id: 7, result: JSON.stringify(scan([22])), startedAt: null }];
  assert.equal(changesForScans(only, types), null);

  // two scans, no older baseline: every change stays unconfirmed
  const two = [
    { id: 9, result: JSON.stringify(scan([22])), startedAt: new Date("2026-09-18T02:00:00Z") },
    { id: 8, result: JSON.stringify(scan([22, 80])), startedAt: new Date("2026-09-18T01:00:00Z") },
  ];
  const changes = changesForScans(two, types);
  assert.equal(changes?.since, "2026-09-18T01:00:00.000Z");
  assert.deepEqual(changes?.diff.portsClosed.map((p) => p.port), [80]);
  assert.equal(changes?.diff.portsClosed[0].confirmed, false);
});

test("storedDiffHasChanges reads the audit trail without trusting its shape", () => {
  // a current era diff with a real change
  const raw = JSON.stringify(diffScanOutputs(input([22]), input([22, 80])));
  assert.equal(storedDiffHasChanges(raw), true);
  // a quiet scan stores the all empty shape
  const quiet = JSON.stringify(diffScanOutputs(input([22]), input([22])));
  assert.equal(storedDiffHasChanges(quiet), false);
  // rows from the era that stored one certificate object instead of an array
  assert.equal(
    storedDiffHasChanges(
      JSON.stringify({
        portsOpened: [],
        portsClosed: [],
        findingsNew: [],
        findingsResolved: [],
        certExpiryChanged: { port: 443, from: "a", to: "b" },
      }),
    ),
    true,
  );
  assert.equal(
    storedDiffHasChanges(
      JSON.stringify({ portsOpened: [], certExpiryChanged: {} }),
    ),
    false,
  );
  // no diff at all, or a broken one, is no change
  assert.equal(storedDiffHasChanges(null), false);
  assert.equal(storedDiffHasChanges("not json"), false);
});
