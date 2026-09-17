import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FINDING_CATALOG,
  FINDING_TYPES,
  SEVERITY_ORDER,
  severityRank,
} from "../src/lib/catalog";
import { TOP_PORTS } from "../src/lib/ports";

test("every finding type has a complete catalog entry", () => {
  for (const type of FINDING_TYPES) {
    const entry = FINDING_CATALOG[type];
    assert.ok(entry, `missing catalog entry for ${type}`);
    for (const field of ["title", "meaning", "why", "fix"] as const) {
      assert.equal(
        typeof entry[field],
        "string",
        `${type}.${field} must be a string`,
      );
      assert.ok(
        (entry[field] as string).trim().length > 0,
        `${type}.${field} must not be empty`,
      );
    }
    assert.ok(
      !entry.title.includes("TODO") && !entry.fix.includes("TODO"),
      `${type} still contains placeholder text`,
    );
  }
  assert.equal(
    Object.keys(FINDING_CATALOG).length,
    FINDING_TYPES.length,
    "catalog has entries outside FINDING_TYPES",
  );
});

test("severity mapping matches the v0 spec exactly", () => {
  const expected: Record<string, string> = {
    tls_cert_expired: "high",
    tls_cert_expiring_soon: "medium",
    dmarc_missing: "high",
    dmarc_policy_none: "medium",
    spf_missing: "medium",
    open_port_telnet_ftp_rdp: "high",
    open_port_unexpected: "low",
    missing_hsts: "low",
    no_https_redirect: "low",
    server_banner_disclosure: "info",
  };
  for (const [type, severity] of Object.entries(expected)) {
    assert.equal(
      FINDING_CATALOG[type as keyof typeof FINDING_CATALOG].severity,
      severity,
      `${type} must be ${severity}`,
    );
  }
});

test("severity rank orders from worst to least", () => {
  const ranks = SEVERITY_ORDER.map(severityRank);
  assert.deepEqual(
    ranks,
    [...ranks].sort((a, b) => a - b),
    "SEVERITY_ORDER must be sorted ascending by rank",
  );
  assert.equal(severityRank("high"), 0);
  assert.ok(severityRank("high") < severityRank("medium"));
  assert.ok(severityRank("medium") < severityRank("low"));
  assert.ok(severityRank("low") < severityRank("info"));
});

test("top port list is 100 unique ascending ports incl. the famous ones", () => {
  assert.equal(TOP_PORTS.length, 100);
  assert.deepEqual(
    TOP_PORTS,
    [...new Set(TOP_PORTS)].sort((a, b) => a - b),
    "port list must be unique and ascending",
  );
  for (const port of [21, 22, 23, 80, 443, 3389]) {
    assert.ok(TOP_PORTS.includes(port), `port list must contain ${port}`);
  }
});
