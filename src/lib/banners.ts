import net from "node:net";
import tls from "node:tls";

// after the sweep, each open port gets one short conversation: we listen
// for a greeting, speak http if nothing arrives, or read the certificate on
// TLS ports. ports that say nothing are recorded as silent, which is a real
// result, not a failure. nothing is sent except the one http GET.

export const TLS_PORTS = new Set([443, 465, 993, 995]);

export interface Banner {
  port: number;
  // read: the service spoke first. http: it answered a GET. tls: certificate
  // subject, or the reason the handshake was rejected. silent: nothing came
  // back.
  kind: "read" | "http" | "tls" | "silent";
  line: string;
}

const GREETING_TIMEOUT_MS = 1500;
const BANNER_MAX_BYTES = 512;
const HTTP_TIMEOUT_MS = 2500;
const HTTP_MAX_BYTES = 4096;
const LINE_MAX_CHARS = 160;

// strips control characters and collapses to one bounded line
export function cleanBannerLine(input: string): string {
  const firstLine = input.split(/\r?\n/).find((part) => part.trim() !== "");
  const joined = (firstLine ?? "")
    .replace(/[\x00-\x1f\x7f\s]+/g, " ")
    .trim();
  return joined.length > LINE_MAX_CHARS
    ? `${joined.slice(0, LINE_MAX_CHARS - 3)}...`
    : joined;
}

// first line + server header out of a raw http response head
export function parseHttpHead(head: string): string | null {
  const statusLine = head.split(/\r?\n/)[0] ?? "";
  const match = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+\d{3}(?:\s+(.*))?$/i);
  if (!match) return null;
  const server = head.match(/^server:\s*(.+)$/im)?.[1]?.trim();
  const status = `HTTP ${statusLine.split(/\s+/)[1]}${match[1] ? ` ${match[1]}` : ""}`;
  return cleanBannerLine(server ? `${status}; server ${server}` : status);
}

export function isTlsPort(port: number): boolean {
  return TLS_PORTS.has(port);
}

function collect(
  socket: net.Socket,
  maxBytes: number,
  timeoutMs: number,
  until?: (buffer: string) => boolean,
): Promise<string | null> {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const done = (result: string | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk: Buffer) => {
      out += chunk.toString("latin1");
      if (out.length >= maxBytes || (until && until(out))) done(out);
    });
    socket.once("timeout", () => done(out.length > 0 ? out : null));
    socket.once("error", () => done(out.length > 0 ? out : null));
    socket.once("close", () => done(out.length > 0 ? out : null));
  });
}

// listen only: many services (ssh, ftp, smtp) speak first
function readGreeting(host: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.once("error", () => resolve(null));
    socket.connect(port, host);
    collect(socket, BANNER_MAX_BYTES, GREETING_TIMEOUT_MS).then((out) => {
      resolve(out === null || out.trim() === "" ? null : out);
    });
  });
}

// one plain http GET for ports that stayed quiet
function readHttpBanner(host: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.once("error", () => resolve(null));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(null);
    });
    socket.connect(port, host, () => {
      socket.write(
        `GET / HTTP/1.0\r\nHost: ${host}\r\nUser-Agent: openports\r\nAccept: */*\r\n\r\n`,
      );
    });
    collect(
      socket,
      HTTP_MAX_BYTES,
      HTTP_TIMEOUT_MS,
      (buffer) => buffer.includes("\r\n\r\n") || buffer.includes("\n\n"),
    ).then((out) => resolve(out === null ? null : parseHttpHead(out)));
  });
}

// TLS ports: certificate validation stays on. a valid cert reports its
// subject; a self-signed, expired or mismatched one is reported as
// rejected, which is the more useful answer for a monitoring tool anyway.
function readTlsLine(host: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    // no credentials or user data cross this connection, the host is
    // resolved through resolvePublicHost first, and the socket closes right
    // after the handshake.
    const socket = tls.connect({ host, port, servername: host });
    socket.setTimeout(3000);
    socket.once("secureConnect", () => {
      try {
        const cert = socket.getPeerCertificate();
        const cn = cert.subject?.CN;
        socket.destroy();
        resolve(cn ? `certificate subject ${cn}` : null);
      } catch {
        socket.destroy();
        resolve(null);
      }
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(null);
    });
    socket.once("error", (err) =>
      resolve(`certificate rejected: ${cleanBannerLine(err.message)}`),
    );
  });
}

export async function grabBanner(host: string, port: number): Promise<Banner> {
  const greeting = await readGreeting(host, port);
  if (greeting !== null && cleanBannerLine(greeting) !== "") {
    return { port, kind: "read", line: cleanBannerLine(greeting) };
  }
  if (isTlsPort(port)) {
    const tlsLine = await readTlsLine(host, port);
    if (tlsLine) return { port, kind: "tls", line: tlsLine };
  } else {
    const http = await readHttpBanner(host, port);
    if (http) return { port, kind: "http", line: http };
  }
  return { port, kind: "silent", line: "no banner" };
}

export async function grabAllBanners(
  host: string,
  ports: number[],
): Promise<Banner[]> {
  return Promise.all(ports.map((port) => grabBanner(host, port)));
}
