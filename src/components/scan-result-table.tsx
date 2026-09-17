import type { ScanResult, TlsResult, HttpResult } from "@/lib/scan-types";
import { formatDuration } from "@/lib/format";

// the full scan result as one table. this is the interface, not a summary
// of it: everything the scanner learned, in the order it learned it.
export default function ScanResultTable({ result }: { result: ScanResult }) {
  const bannerLines = (result.banners ?? []).map((b) => `${b.port}: ${b.line}`);
  const rows: [string, string][] = [
    ["resolved", result.addresses.join(", ")],
    [
      "sweep",
      `${result.ports.scanned} ports in ${formatDuration(result.ports.durationMs)}: ` +
        `${result.ports.open.length} open, ${result.ports.refused} refused, ` +
        `${result.ports.filtered} filtered`,
    ],
    ["ports open", result.ports.open.join(", ") || "none"],
    ...(bannerLines.length > 0 ? [["services", bannerLines.join("\n")] as [string, string]] : []),
    ["tls 443", tlsRow(result.tls)],
    ["spf", result.dns.spf ?? "absent"],
    ["dmarc", result.dns.dmarc ?? "absent"],
    ["mx", mxRow(result.dns.mx, result.dns.mxError)],
    ["http", httpRow(result.http)],
  ];

  return (
    <table className="mt-3 w-full max-w-3xl border-collapse">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-line">
            <th
              scope="row"
              className="w-28 py-1.5 pr-4 text-left align-top text-xs font-normal text-muted"
            >
              {label}
            </th>
            <td className="py-1.5 font-mono text-xs break-words whitespace-pre-line text-ink">
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function tlsRow(tls: TlsResult): string {
  if (!tls.checked) return `not checked: ${tls.error ?? "port 443 was not open"}`;
  if (!tls.ok) return `handshake failed: ${tls.error}`;
  const days =
    typeof tls.daysRemaining === "number" ? ` (${tls.daysRemaining} days left)` : "";
  return `subject ${tls.subject}, issued by ${tls.issuer}, expires ${
    tls.validTo?.slice(0, 10) ?? "?"
  }${days}`;
}

function mxRow(
  mx: { exchange: string; priority: number }[],
  mxError?: string,
): string {
  if (mx.length > 0) {
    return mx.map((m) => `${m.priority} ${m.exchange}`).join(", ");
  }
  return mxError ? `none (${mxError})` : "none";
}

function httpRow(http: HttpResult): string {
  const parts: string[] = [];

  if (!http.port80Open) {
    parts.push("port 80 closed");
  } else if (http.redirectsToHttps) {
    parts.push(`port 80 redirects to https (${http.status})`);
  } else if (http.status !== undefined) {
    parts.push(`port 80 answers ${http.status}, no redirect`);
  } else {
    // the sweep saw 80 open but http never answered: the scanme port 80
    // haunting from devlog 001
    parts.push(`port 80 open, http request failed: ${shortError(http.error)}`);
  }

  if (http.httpsOk) {
    parts.push(http.hsts ? `hsts "${http.hsts}"` : "no hsts header");
    if (http.server) parts.push(`server "${http.server}"`);
  } else {
    parts.push(`https failed: ${shortError(http.error)}`);
  }

  return parts.join("; ");
}

// the timeout abort carries a long sentence, the table wants the cause
function shortError(error?: string): string {
  if (!error) return "no answer";
  return error.includes("aborted due to timeout") ? "timed out" : error;
}
