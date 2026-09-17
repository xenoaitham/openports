import net from "node:net";
import tls from "node:tls";
import { promises as dns } from "node:dns";
import { TOP_PORTS } from "./ports";
import { resolvePublicHost } from "./host";
import type { HttpResult, ScanResult, TlsResult } from "./scan-types";

const CONNECT_TIMEOUT_MS = 1500;
const SWEEP_CONCURRENCY = 64;
const TLS_TIMEOUT_MS = 5000;
const HTTP_TIMEOUT_MS = 6000;

// opens a raw tcp connection and destroys it. nothing is sent, no service
// probing: a port is "open" when the handshake completes. refused means the
// host answered with a reset, filtered means we heard nothing back.
function checkPort(
  host: string,
  port: number,
): Promise<"open" | "refused" | "filtered"> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (state: "open" | "refused" | "filtered") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(state);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => done("open"));
    socket.once("timeout", () => done("filtered"));
    socket.once("error", (err) =>
      done(
        (err as NodeJS.ErrnoException).code === "ECONNREFUSED"
          ? "refused"
          : "filtered",
      ),
    );
    socket.connect(port, host);
  });
}

async function sweepPorts(host: string): Promise<{
  scanned: number;
  open: number[];
  refused: number;
  filtered: number;
  durationMs: number;
}> {
  const started = Date.now();
  const open: number[] = [];
  let refused = 0;
  let filtered = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < TOP_PORTS.length) {
      const port = TOP_PORTS[cursor++];
      const state = await checkPort(host, port);
      if (state === "open") open.push(port);
      else if (state === "refused") refused += 1;
      else filtered += 1;
    }
  }

  await Promise.all(Array.from({ length: SWEEP_CONCURRENCY }, () => worker()));
  return {
    scanned: TOP_PORTS.length,
    open: open.sort((a, b) => a - b),
    refused,
    filtered,
    durationMs: Date.now() - started,
  };
}

// constraint: this is a certificate auditor. it has to be able to read
// expired, self-signed and mismatched certificates, because reporting them
// is the point (see tls_cert_expired in the catalog). no credentials or user
// data cross this connection, the host is resolved through resolvePublicHost
// first, and the socket is closed right after the handshake.
const ALLOW_UNTRUSTED_CERTS_FOR_INSPECTION = false;

function checkTls(host: string): Promise<TlsResult> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port: 443,
      servername: host,
      rejectUnauthorized: ALLOW_UNTRUSTED_CERTS_FOR_INSPECTION,
    });
    const fail = (error: string) => {
      socket.destroy();
      resolve({ checked: true, ok: false, error });
    };
    socket.setTimeout(TLS_TIMEOUT_MS);
    socket.once("secureConnect", () => {
      try {
        const cert = socket.getPeerCertificate();
        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.floor(
          (validTo.getTime() - Date.now()) / 86_400_000,
        );
        socket.end();
        resolve({
          checked: true,
          ok: true,
          issuer:
            (cert.issuer?.O as string) ??
            (cert.issuer?.CN as string) ??
            "unknown issuer",
          subject: (cert.subject?.CN as string) ?? host,
          validTo: validTo.toISOString(),
          daysRemaining,
        });
      } catch {
        fail("could not read the certificate");
      }
    });
    socket.once("timeout", () => fail("TLS handshake timed out"));
    socket.once("error", (err) =>
      fail(`TLS handshake failed (${err.code ?? err.message})`),
    );
  });
}

async function checkDns(host: string): Promise<ScanResult["dns"]> {
  const [spfRes, dmarcRes, mxRes] = await Promise.allSettled([
    dns.resolveTxt(host),
    dns.resolveTxt(`_dmarc.${host}`),
    dns.resolveMx(host),
  ]);

  const joinRecords = (v: unknown): string[] =>
    Array.isArray(v) ? (v as string[][]).map((chunks) => chunks.join("")) : [];

  const spf =
    spfRes.status === "fulfilled"
      ? (joinRecords(spfRes.value).find((r) =>
          r.toLowerCase().startsWith("v=spf1"),
        ) ?? null)
      : null;
  const dmarc =
    dmarcRes.status === "fulfilled"
      ? (joinRecords(dmarcRes.value).find((r) =>
          r.toLowerCase().startsWith("v=dmarc1"),
        ) ?? null)
      : null;
  const mx =
    mxRes.status === "fulfilled"
      ? mxRes.value
          .map((m) => ({ exchange: m.exchange, priority: m.priority }))
          .sort((a, b) => a.priority - b.priority)
      : [];

  return {
    spf,
    dmarc,
    mx,
    ...(mxRes.status === "rejected"
      ? { mxError: String(mxRes.reason?.code ?? "lookup failed") }
      : {}),
  };
}

// fetch with redirect: manual so we can see the first hop ourselves.
// the domain was resolved and checked by resolvePublicHost before we got here.
async function checkHttp(
  host: string,
  port80Open: boolean,
): Promise<HttpResult> {
  const result: HttpResult = { port80Open, httpsOk: false };

  if (port80Open) {
    const plain = await fetch(`http://${host}/`, {
      redirect: "manual",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: { accept: "*/*" },
    })
      .then((res) => ({ res, error: null as string | null }))
      .catch((err) => ({
        res: null,
        error: String(err?.cause?.code ?? err.message),
      }));

    if (plain.res) {
      const location = plain.res.headers.get("location") ?? "";
      result.status = plain.res.status;
      result.finalUrl = location || `http://${host}/`;
      result.redirectsToHttps = location
        .toLowerCase()
        .startsWith("https://");
      result.server = plain.res.headers.get("server");
      await plain.res.body?.cancel().catch(() => {});
    } else {
      result.error = plain.error ?? "port 80 answered the sweep but not http";
    }
  }

  const secure = await fetch(`https://${host}/`, {
    redirect: "manual",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: { accept: "*/*" },
  })
    .then((res) => ({ res, error: null as string | null }))
    .catch((err) => ({
      res: null,
      error: String(err?.cause?.code ?? err.message),
    }));

  if (secure.res) {
    result.httpsOk = true;
    result.status = secure.res.status;
    result.finalUrl = `https://${host}/`;
    result.hsts = secure.res.headers.get("strict-transport-security");
    const banner = secure.res.headers.get("server");
    if (banner) result.server = banner;
    await secure.res.body?.cancel().catch(() => {});
  } else if (!result.error) {
    result.error = secure.error ?? "https request failed";
  }

  return result;
}

// runs every check for one verified target and returns raw data.
// the caller stores it and evaluateScanResult turns it into findings.
export async function runScanChecks(domain: string): Promise<ScanResult> {
  const addresses = await resolvePublicHost(domain);
  const host = addresses[0];

  const ports = await sweepPorts(host);

  const tls = ports.open.includes(443)
    ? await checkTls(host)
    : { checked: false, ok: false, error: "port 443 is not open" };

  const dnsResult = await checkDns(domain);
  const http = await checkHttp(domain, ports.open.includes(80));

  return {
    host: domain,
    addresses,
    ports,
    tls,
    dns: dnsResult,
    http,
  };
}
