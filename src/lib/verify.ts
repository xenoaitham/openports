import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";

export function generateToken(): string {
  return `openports-verify=${randomBytes(16).toString("hex")}`;
}

export function txtRecordName(domain: string): string {
  return `_openports.${domain}`;
}

// dns.resolveTxt returns one record as a list of chunks because a single TXT
// string can be split at 255 bytes. join before comparing.
export function recordContainsToken(
  records: string[][],
  token: string,
): boolean {
  return records.some((chunks) => chunks.join("").includes(token));
}

export interface TxtCheckResult {
  ok: boolean;
  reason?: string;
}

// passive DNS lookup, safe to run before ownership is proven
export async function checkTxtRecord(
  domain: string,
  token: string,
): Promise<TxtCheckResult> {
  let records: string[][];
  try {
    records = await dns.resolveTxt(txtRecordName(domain));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return {
        ok: false,
        reason: `no TXT record at ${txtRecordName(domain)} yet`,
      };
    }
    return { ok: false, reason: `DNS lookup failed (${code ?? "unknown"})` };
  }
  if (!recordContainsToken(records, token)) {
    return { ok: false, reason: "record found but the token does not match" };
  }
  return { ok: true };
}
