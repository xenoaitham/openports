import type { Severity } from "./types";

// one entry per finding the scanner can produce. this catalog and everything
// in evaluate.ts stay free of UI imports so the future public report page can
// render straight from them.
export const FINDING_TYPES = [
  "tls_cert_expired",
  "tls_cert_expiring_soon",
  "dmarc_missing",
  "dmarc_policy_none",
  "spf_missing",
  "open_port_telnet_ftp_rdp",
  "open_port_unexpected",
  "missing_hsts",
  "no_https_redirect",
  "server_banner_disclosure",
] as const;

export type FindingType = (typeof FINDING_TYPES)[number];

export interface CatalogEntry {
  type: FindingType;
  severity: Severity;
  title: string;
  meaning: string;
  why: string;
  fix: string;
}

export const FINDING_CATALOG: Record<FindingType, CatalogEntry> = {
  tls_cert_expired: {
    type: "tls_cert_expired",
    severity: "high",
    title: "TLS certificate expired",
    meaning:
      "The certificate served on port 443 has a not-after date in the past.",
    why: "Browsers show a full page warning and many API clients refuse to connect outright. It also makes a real interception attempt look identical to a broken site.",
    fix: "Issue a new certificate and deploy it. Let's Encrypt is free. If you already run automated renewal, trigger it manually once and check its timer, because it clearly did not fire.",
  },
  tls_cert_expiring_soon: {
    type: "tls_cert_expiring_soon",
    severity: "medium",
    title: "TLS certificate expires in under 30 days",
    meaning:
      "The certificate on port 443 is still valid but its expiry date is less than 30 days away.",
    why: "When it lapses, the site goes from trusted to warning page with no other change. Certificate expiry is the most common self-inflicted outage on small sites.",
    fix: "Renew now, then make sure renewal is automated and actually runs. With certbot, run certbot renew --dry-run to test the whole path.",
  },
  dmarc_missing: {
    type: "dmarc_missing",
    severity: "high",
    title: "No DMARC record",
    meaning:
      "The DNS zone has no DMARC record, so receiving mail servers have no instruction for mail that claims to be from this domain and fails the check.",
    why: "Anyone can send email with your domain in the From header. Without DMARC, inboxes have no policy to reject or quarantine it, which is the basis of most phishing that impersonates a company.",
    fix: "Publish a DMARC record at _dmarc. Start with p=none plus a rua= report address so you can watch what legitimate mail sends on your behalf, then tighten once the reports are quiet.",
  },
  dmarc_policy_none: {
    type: "dmarc_policy_none",
    severity: "medium",
    title: "DMARC is in monitoring mode (p=none)",
    meaning:
      "A DMARC record exists but its policy is p=none, which asks receiving servers to do nothing when a message fails.",
    why: "p=none is a testing state. Spoofed mail from your domain still lands in inboxes, so on paper the record exists but it protects nobody.",
    fix: "Read the aggregate reports for a week or two, identify every legitimate sender, then move the policy to p=quarantine and later p=reject.",
  },
  spf_missing: {
    type: "spf_missing",
    severity: "medium",
    title: "No SPF record",
    meaning:
      "The zone has no TXT record starting with v=spf1, so nothing declares which servers are allowed to send mail for this domain.",
    why: "SPF alone does not stop spoofing, but without it DMARC alignment is hard to pass and receivers fall back to guessing from reputation alone.",
    fix: "Publish an SPF record listing your real senders, for example v=spf1 include:_spf.google.com -all. Stay under the 10 DNS lookup limit or receivers will ignore it.",
  },
  open_port_telnet_ftp_rdp: {
    type: "open_port_telnet_ftp_rdp",
    severity: "high",
    title: "Remote access port exposed (21, 23 or 3389)",
    meaning:
      "At least one of FTP (21), Telnet (23) or RDP (3389) answered on the public internet.",
    why: "Telnet and FTP send credentials in clear text and all three are under constant brute force. Exposed RDP is the most common way small networks get hit with ransomware.",
    fix: "Close the port at the firewall unless there is a specific need. Move RDP behind a VPN, replace Telnet with SSH, replace FTP with SFTP. If a port must stay open, restrict it to known source addresses.",
  },
  open_port_unexpected: {
    type: "open_port_unexpected",
    severity: "low",
    title: "Unexpected open port",
    meaning:
      "Ports other than 80 and 443 answered. From the outside it is not always clear what is listening on them.",
    why: "Every open port is something that can have a vulnerability. Admin panels, databases and old services stay exposed because a firewall rule was never cleaned up.",
    fix: "Find out what listens on each port listed in the evidence. Close what has no owner, firewall the rest to the networks that need it.",
  },
  missing_hsts: {
    type: "missing_hsts",
    severity: "low",
    title: "No HSTS header",
    meaning: "The HTTPS response carries no Strict-Transport-Security header.",
    why: "Without HSTS a browser will still try plain HTTP first, which lets an attacker on the same network downgrade the connection and read it.",
    fix: "Add Strict-Transport-Security: max-age=31536000; includeSubDomains once every subdomain serves valid HTTPS, not before.",
  },
  no_https_redirect: {
    type: "no_https_redirect",
    severity: "low",
    title: "HTTP does not redirect to HTTPS",
    meaning:
      "Port 80 answered with content or an error instead of redirecting to https.",
    why: "People type bare domains into the address bar. Without the redirect they land on the unencrypted site and search engines may index the http version.",
    fix: "Send a 301 from http to https for every path. With nginx or Apache this is two lines in the vhost, on a hosted load balancer it is one checkbox.",
  },
  server_banner_disclosure: {
    type: "server_banner_disclosure",
    severity: "info",
    title: "Server banner disclosed",
    meaning:
      "The response includes a Server header naming the software and often the exact version.",
    why: "A version number makes it trivial to match your stack against public exploits. Not a vulnerability on its own, it is free reconnaissance.",
    fix: "Trim the header at the edge: server_tokens off in nginx, ServerTokens Prod in Apache, or strip it at the CDN.",
  },
};

export const SEVERITY_ORDER: Severity[] = ["high", "medium", "low", "info"];

export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

export function getCatalogEntry(type: string): CatalogEntry | undefined {
  return (FINDING_CATALOG as Record<string, CatalogEntry | undefined>)[type];
}
