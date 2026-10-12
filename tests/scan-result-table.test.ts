import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ScanResultTable from "../src/components/scan-result-table";
import type { ScanResult } from "../src/lib/scan-types";

function result(): ScanResult {
  return {
    host: "example.com",
    addresses: ["203.0.113.1"],
    ports: {
      scanned: 100,
      open: [],
      refused: 90,
      filtered: 10,
      durationMs: 1500,
    },
    banners: [],
    tls: [],
    dns: { spf: null, dmarc: null, mx: [] },
    http: { port80Open: false, httpsOk: false },
  };
}

function renderedRows(scan: ScanResult): string[][] {
  const html = renderToStaticMarkup(
    createElement(ScanResultTable, { result: scan }),
  );
  return Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g), ([, row]) =>
    Array.from(
      row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g),
      ([, text]) => text,
    ),
  );
}

test("scan table preserves row order and empty-result descriptions", () => {
  assert.deepEqual(renderedRows(result()), [
    ["resolved", "203.0.113.1"],
    ["sweep", "100 ports in 1.5s: 0 open, 90 refused, 10 filtered"],
    ["ports open", "none"],
    ["tls", "no tls port open (443, 465, 993, 995)"],
    ["spf", "absent"],
    ["dmarc", "absent"],
    ["mx", "none"],
    ["http", "port 80 closed; https failed: no answer"],
  ]);
});

test("scan table preserves services, multiple TLS checks, DNS and HTTP text", () => {
  const scan = result();
  scan.ports.open = [22, 80, 443, 993];
  scan.banners = [{ port: 22, kind: "read", line: "SSH-2.0-example" }];
  scan.tls = [
    {
      port: 443,
      checked: true,
      ok: true,
      subject: "example.com",
      issuer: "Example CA",
      validTo: "2027-01-20T00:00:00Z",
      daysRemaining: 99,
    },
    { port: 993, checked: true, ok: false, error: "certificate expired" },
  ];
  scan.dns = {
    spf: "v=spf1 -all",
    dmarc: "v=DMARC1; p=reject",
    mx: [{ priority: 10, exchange: "mail.example.com" }],
  };
  scan.http = {
    port80Open: true,
    httpsOk: true,
    redirectsToHttps: true,
    status: 301,
    hsts: "max-age=31536000",
    server: "example",
  };

  assert.deepEqual(renderedRows(scan), [
    ["resolved", "203.0.113.1"],
    ["sweep", "100 ports in 1.5s: 4 open, 90 refused, 10 filtered"],
    ["ports open", "22, 80, 443, 993"],
    ["services", "22: SSH-2.0-example"],
    [
      "tls 443",
      "subject example.com, issued by Example CA, expires 2027-01-20 (99 days left)",
    ],
    ["tls 993", "certificate expired"],
    ["spf", "v=spf1 -all"],
    ["dmarc", "v=DMARC1; p=reject"],
    ["mx", "10 mail.example.com"],
    [
      "http",
      "port 80 redirects to https (301); hsts &quot;max-age=31536000&quot;; server &quot;example&quot;",
    ],
  ]);
});
