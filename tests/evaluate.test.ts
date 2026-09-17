import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateScanResult } from "../src/lib/evaluate";
import type { ScanResult } from "../src/lib/scan-types";

function baseResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    host: "example.com",
    addresses: ["93.184.216.34"],
    ports: { scanned: 100, open: [80, 443], refused: 98, filtered: 0, durationMs: 2000 },
    tls: { checked: false, ok: false },
    dns: {
      spf: "v=spf1 -all",
      dmarc: "v=DMARC1; p=reject;",
      mx: [],
    },
    http: {
      port80Open: true,
      httpsOk: true,
      status: 200,
      redirectsToHttps: true,
      hsts: "max-age=31536000",
      server: null,
    },
    banners: [],
    ...overrides,
  };
}

test("a clean scan produces no findings", () => {
  assert.deepEqual(evaluateScanResult(baseResult()), []);
});

test("expired and expiring certificates are flagged", () => {
  const expired = evaluateScanResult(
    baseResult({
      tls: {
        checked: true,
        ok: true,
        daysRemaining: -3,
        validTo: "2020-01-01T00:00:00.000Z",
        issuer: "Let's Encrypt",
      },
    }),
  );
  assert.equal(expired.length, 1);
  assert.equal(expired[0].type, "tls_cert_expired");
  assert.equal(expired[0].severity, "high");

  const soon = evaluateScanResult(
    baseResult({
      tls: {
        checked: true,
        ok: true,
        daysRemaining: 12,
        validTo: "2026-09-30T00:00:00.000Z",
        issuer: "Let's Encrypt",
      },
    }),
  );
  assert.equal(soon[0].type, "tls_cert_expiring_soon");
  assert.equal(soon[0].severity, "medium");

  // 30 days exactly is still outside the warn window
  const edge = evaluateScanResult(
    baseResult({ tls: { checked: true, ok: true, daysRemaining: 30 } }),
  );
  assert.deepEqual(edge, []);
});

test("no tls at all is not invented into a cert finding", () => {
  const result = baseResult({
    tls: { checked: false, ok: false, error: "port 443 is not open" },
  });
  assert.ok(!result.tls.checked);
  assert.ok(
    !evaluateScanResult(result).some((f) => f.type.startsWith("tls_")),
  );
});

test("dmarc missing vs p=none vs enforcing", () => {
  const missing = evaluateScanResult(
    baseResult({ dns: { spf: "v=spf1 -all", dmarc: null, mx: [] } }),
  );
  assert.equal(missing[0].type, "dmarc_missing");
  assert.equal(missing[0].severity, "high");

  const none = evaluateScanResult(
    baseResult({
      dns: { spf: "v=spf1 -all", dmarc: "v=DMARC1; p=none; rua=mailto:x@y.z", mx: [] },
    }),
  );
  assert.equal(none[0].type, "dmarc_policy_none");
  assert.deepEqual(none[0].evidence, { policy: "none" });

  const enforcing = evaluateScanResult(
    baseResult({ dns: { spf: null, dmarc: "v=DMARC1; p=reject", mx: [] } }),
  );
  assert.equal(enforcing[0].type, "spf_missing");
  assert.ok(!enforcing.some((f) => f.type.startsWith("dmarc")));
});

test("dangerous ports win over the generic unexpected finding", () => {
  const result = evaluateScanResult(
    baseResult({ ports: { scanned: 100, open: [22, 23, 80, 443, 8080], refused: 95, filtered: 0, durationMs: 2000 } }),
  );
  const types = result.map((f) => f.type);
  assert.ok(types.includes("open_port_telnet_ftp_rdp"));
  assert.ok(types.includes("open_port_unexpected"));
  const dangerous = result.find((f) => f.type === "open_port_telnet_ftp_rdp");
  assert.deepEqual(dangerous?.evidence.ports, [23]);
  const unexpected = result.find((f) => f.type === "open_port_unexpected");
  assert.deepEqual(unexpected?.evidence.ports, [22, 8080]);
  assert.equal(dangerous?.severity, "high");
  assert.equal(unexpected?.severity, "low");
});

test("banners for the finding's ports land in the evidence", () => {
  const result = evaluateScanResult(
    baseResult({
      ports: { scanned: 100, open: [22, 80, 443, 8080], refused: 97, filtered: 0, durationMs: 2000 },
      banners: [
        { port: 22, kind: "read", line: "SSH-2.0-OpenSSH_9.6p1" },
        { port: 80, kind: "http", line: "HTTP 301; server nginx" },
        { port: 8080, kind: "silent", line: "no banner" },
      ],
    }),
  );
  const unexpected = result.find((f) => f.type === "open_port_unexpected");
  assert.deepEqual(unexpected?.evidence.banners, [
    "22: SSH-2.0-OpenSSH_9.6p1",
    "8080: no banner",
  ]);
});

test("http findings need the data to back them", () => {
  const noHsts = evaluateScanResult(
    baseResult({ http: { port80Open: true, httpsOk: true, redirectsToHttps: true, hsts: null, server: null } }),
  );
  assert.deepEqual(
    noHsts.map((f) => f.type),
    ["missing_hsts"],
  );

  const noRedirect = evaluateScanResult(
    baseResult({
      http: { port80Open: true, httpsOk: true, status: 200, redirectsToHttps: false, hsts: "max-age=1", server: "nginx" },
    }),
  );
  assert.ok(noRedirect.some((f) => f.type === "no_https_redirect"));
  assert.ok(noRedirect.some((f) => f.type === "server_banner_disclosure"));

  // port 80 closed: nothing to say about redirects
  const port80Closed = evaluateScanResult(
    baseResult({ http: { port80Open: false, httpsOk: true, redirectsToHttps: undefined, hsts: "x", server: null } }),
  );
  assert.ok(!port80Closed.some((f) => f.type === "no_https_redirect"));
});

test("findings come back sorted worst first", () => {
  const result = evaluateScanResult(
    baseResult({
      ports: { scanned: 100, open: [8080], refused: 99, filtered: 0, durationMs: 1000 },
      dns: { spf: null, dmarc: null, mx: [] },
      http: { port80Open: true, httpsOk: true, status: 200, redirectsToHttps: false, hsts: null, server: "Apache" },
    }),
  );
  const severities = result.map((f) => f.severity);
  const order = ["high", "medium", "low", "info"];
  const indexes = severities.map((s) => order.indexOf(s));
  assert.deepEqual(
    indexes,
    [...indexes].sort((a, b) => a - b),
    `findings not sorted by severity: ${severities.join(",")}`,
  );
});
