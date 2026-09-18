import type { Banner } from "./banners";

export type { Banner } from "./banners";

export interface DnsResult {
  spf: string | null;
  dmarc: string | null;
  mx: { exchange: string; priority: number }[];
  mxError?: string;
}

export interface TlsResult {
  port: number;
  checked: boolean;
  ok: boolean;
  issuer?: string;
  subject?: string;
  validTo?: string;
  daysRemaining?: number;
  // on a failed handshake this is the plain reason: certificate expired,
  // self-signed certificate, certificate hostname mismatch
  error?: string;
}

// scans stored before the per port shape kept a single object without the
// port; those were all the 443 check. new rows always carry an array.
export function tlsResultsOf(result: ScanResult | null | undefined): TlsResult[] {
  const tls = result?.tls;
  if (Array.isArray(tls)) return tls;
  if (tls && typeof tls === "object" && "checked" in (tls as object)) {
    return [{ ...(tls as TlsResult), port: (tls as TlsResult).port ?? 443 }];
  }
  return [];
}

export interface HttpResult {
  port80Open: boolean;
  httpsOk: boolean;
  status?: number;
  finalUrl?: string;
  redirectsToHttps?: boolean;
  hsts?: string | null;
  server?: string | null;
  error?: string;
}

export interface ScanResult {
  host: string;
  addresses: string[];
  ports: {
    scanned: number;
    open: number[];
    refused: number;
    filtered: number;
    durationMs: number;
  };
  tls: TlsResult[];
  dns: DnsResult;
  http: HttpResult;
  banners: Banner[];
}
