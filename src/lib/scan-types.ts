export interface DnsResult {
  spf: string | null;
  dmarc: string | null;
  mx: { exchange: string; priority: number }[];
  mxError?: string;
}

export interface TlsResult {
  checked: boolean;
  ok: boolean;
  issuer?: string;
  subject?: string;
  validTo?: string;
  daysRemaining?: number;
  error?: string;
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
  ports: { scanned: number; open: number[]; durationMs: number };
  tls: TlsResult;
  dns: DnsResult;
  http: HttpResult;
}
