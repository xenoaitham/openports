import { promises as dns } from "node:dns";
import net from "node:net";

// scanme.nmap.org is the one target allowed without ownership proof.
// the Nmap project runs it specifically so scanner authors can test against it.
export const PREALLOWED_DOMAINS = new Set(["scanme.nmap.org"]);

export function isPreallowed(domain: string): boolean {
  return PREALLOWED_DOMAINS.has(domain);
}

export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  s = s.replace(/\.+$/, "");
  if (!s || s.length > 253) return null;
  if (s === "localhost" || s.endsWith(".localhost")) return null;
  if (s.endsWith(".local") || s.endsWith(".internal") || s.endsWith(".home.arpa")) {
    return null;
  }
  // v0 takes domains only. raw IPs are a footgun for a scanning product.
  if (net.isIP(s)) return null;
  const labels = s.split(".");
  if (labels.length < 2) return null;
  const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!labels.every((l) => label.test(l))) return null;
  return s;
}

function isPrivateIPv4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = o;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (/^fe[89ab]/.test(s)) return true; // link local
  if (/^f[cd]/.test(s)) return true; // unique local
  if (s.startsWith("ff")) return true; // multicast
  if (s.startsWith("::ffff:")) {
    const v4 = s.slice(7);
    return net.isIP(v4) === 4 ? isPrivateIPv4(v4) : true;
  }
  if (s.startsWith("2001:db8:")) return true; // documentation
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

// resolves the domain and refuses anything that points into private or
// reserved space. this is what keeps "add target" from turning into a port
// scanner for other people's internal networks.
export async function resolvePublicHost(domain: string): Promise<string[]> {
  const out: string[] = [];
  const [v4, v6] = await Promise.allSettled([
    dns.resolve4(domain),
    dns.resolve6(domain),
  ]);
  if (v4.status === "fulfilled") out.push(...v4.value);
  if (v6.status === "fulfilled") out.push(...v6.value);
  if (out.length === 0) {
    throw new Error("domain does not resolve");
  }
  const publicOnes = out.filter((ip) => !isPrivateAddress(ip));
  if (publicOnes.length === 0) {
    throw new Error(
      "domain resolves only to private or reserved addresses, refusing to scan",
    );
  }
  return publicOnes;
}
