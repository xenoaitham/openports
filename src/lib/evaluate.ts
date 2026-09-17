import { FINDING_CATALOG, severityRank } from "./catalog";
import type { ScanResult } from "./scan-types";
import type { Severity } from "./types";

export interface DerivedFinding {
  type: keyof typeof FINDING_CATALOG;
  severity: Severity;
  evidence: Record<string, unknown>;
}

const DANGEROUS_PORTS: Record<number, string> = {
  21: "ftp",
  23: "telnet",
  3389: "rdp",
};

const EXPECTED_PORTS = new Set([80, 443]);
const CERT_EXPIRY_WARN_DAYS = 30;

// turns raw scan output into catalog findings. pure function: same input,
// same output, no network, no database. real data only, the scanner decides
// what happened, this only reads it.
export function evaluateScanResult(r: ScanResult): DerivedFinding[] {
  const out: DerivedFinding[] = [];

  if (r.tls.checked && r.tls.ok && typeof r.tls.daysRemaining === "number") {
    if (r.tls.daysRemaining <= 0) {
      out.push({
        type: "tls_cert_expired",
        severity: FINDING_CATALOG.tls_cert_expired.severity,
        evidence: { issuer: r.tls.issuer, validTo: r.tls.validTo },
      });
    } else if (r.tls.daysRemaining < CERT_EXPIRY_WARN_DAYS) {
      out.push({
        type: "tls_cert_expiring_soon",
        severity: FINDING_CATALOG.tls_cert_expiring_soon.severity,
        evidence: {
          issuer: r.tls.issuer,
          validTo: r.tls.validTo,
          daysRemaining: r.tls.daysRemaining,
        },
      });
    }
  }

  if (r.dns.dmarc === null) {
    out.push({
      type: "dmarc_missing",
      severity: FINDING_CATALOG.dmarc_missing.severity,
      evidence: {},
    });
  } else {
    const policy = readDmarcPolicy(r.dns.dmarc);
    if (policy === "none") {
      out.push({
        type: "dmarc_policy_none",
        severity: FINDING_CATALOG.dmarc_policy_none.severity,
        evidence: { policy },
      });
    }
  }

  if (r.dns.spf === null) {
    out.push({
      type: "spf_missing",
      severity: FINDING_CATALOG.spf_missing.severity,
      evidence: {},
    });
  }

  const dangerous = r.ports.open.filter((p) => p in DANGEROUS_PORTS);
  if (dangerous.length > 0) {
    out.push({
      type: "open_port_telnet_ftp_rdp",
      severity: FINDING_CATALOG.open_port_telnet_ftp_rdp.severity,
      evidence: {
        ports: dangerous,
        protocols: dangerous.map((p) => DANGEROUS_PORTS[p]),
      },
    });
  }

  const unexpected = r.ports.open.filter(
    (p) => !EXPECTED_PORTS.has(p) && !(p in DANGEROUS_PORTS),
  );
  if (unexpected.length > 0) {
    out.push({
      type: "open_port_unexpected",
      severity: FINDING_CATALOG.open_port_unexpected.severity,
      evidence: { ports: unexpected },
    });
  }

  if (r.http.port80Open && r.http.redirectsToHttps !== true) {
    out.push({
      type: "no_https_redirect",
      severity: FINDING_CATALOG.no_https_redirect.severity,
      evidence: {
        ...(r.http.status !== undefined ? { status: r.http.status } : {}),
        ...(r.http.error ? { httpError: r.http.error } : {}),
      },
    });
  }

  if (r.http.httpsOk) {
    if (!r.http.hsts) {
      out.push({
        type: "missing_hsts",
        severity: FINDING_CATALOG.missing_hsts.severity,
        evidence: { status: r.http.status },
      });
    }
    if (r.http.server) {
      out.push({
        type: "server_banner_disclosure",
        severity: FINDING_CATALOG.server_banner_disclosure.severity,
        evidence: { server: r.http.server },
      });
    }
  }

  return out.sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );
}

// dmarc records look like "v=DMARC1; p=none; rua=mailto:..."
function readDmarcPolicy(record: string): string | undefined {
  const tags = record
    .toLowerCase()
    .split(";")
    .map((tag) => tag.trim());
  const policyTag = tags.find((tag) => tag.startsWith("p="));
  const policy = policyTag?.slice(2);
  return policy === "" ? undefined : policy;
}
