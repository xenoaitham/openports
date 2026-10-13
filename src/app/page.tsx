import type { Metadata } from "next";
import Link from "next/link";
import FindingsList from "@/components/findings";
import { getLandingReport } from "@/lib/queries";
import { formatDuration, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Domain exposure monitoring",
  description:
    "Check public ports, certificate validity, DNS mail records, and HTTP configuration for domains you manage.",
};

const btn =
  "inline-block border border-ink px-3.5 py-1.5 text-sm text-ink hover:bg-ink hover:text-paper";

export default async function Home() {
  const report = await getLandingReport();

  return (
    <main className="mx-auto max-w-5xl px-4">
      <section className="pb-10 pt-14">
        <h1 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight">
          Monitor domain exposure and scan changes.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Review open ports, certificate problems, mail records, and HTTP
          configuration. Findings include evidence and suggested fixes.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-5">
          <Link href="/app" className={btn}>
            add a domain
          </Link>
        </div>
      </section>

      <section className="border-t border-line py-10">
        <h2 className="text-base font-medium">A report from this instance</h2>
        {report ? (
          <>
            <p
              className="mt-1 max-w-3xl text-sm text-muted"
              // relative time is a snapshot printed at render time
              suppressHydrationWarning
            >
              {report.domain}, finished {timeAgo(report.finishedAt)}, took{" "}
              {formatDuration(report.durationMs)}, ports open:{" "}
              <span className="font-mono text-xs text-ink">
                {report.openPorts.join(", ") || "none"}
              </span>
              .
            </p>
            <div className="mt-4">
              <FindingsList findings={report.findings} />
            </div>
          </>
        ) : (
          <p className="mt-2 max-w-2xl text-sm text-muted">
            No scan has finished on this instance yet. Run{" "}
            <code className="font-mono text-xs text-ink">npm run seed</code>{" "}
            for an occasional test scan, or add a domain under targets:
            the latest report then shows up here.
          </p>
        )}
      </section>

      <section className="border-t border-line py-10">
        <h2 className="text-base font-medium">How a scan gets allowed</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Publish the DNS TXT record shown on the target page and check
          verification. The worker checks the target's stored verification
          status before scanning:
        </p>
        <div className="mt-4 border-b border-t border-line py-3 font-mono text-sm">
          <span className="text-ink">_openports.your-domain.com</span>
          <span className="ml-4 text-muted">TXT</span>
          <span className="ml-4 text-muted">
            &quot;openports-verify=1f3a9c0d44e2b68a07c5d9e1f4b83a26&quot;
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          The value is generated when you add the domain, that line shows the
          shape. The single exception is scanme.nmap.org, which the Nmap
          project runs for scanner testing.
        </p>
      </section>

      <section className="border-t border-line py-10">
        <h2 className="text-base font-medium">What a scan reads</h2>
        <table className="mt-4 w-full max-w-3xl border-collapse text-sm">
          <tbody>
            {(
              [
                [
                  "TCP sweep",
                  "TCP connections to 100 common ports, followed by short banner checks",
                  "remote access port exposed, unexpected open port",
                ],
                [
                  "TLS on 443, 465, 993, 995",
                  "certificate subject, issuer and expiry date on every TLS port that answers, validation left on",
                  "expired, expiring in under 30 days, self-signed, hostname mismatch",
                ],
                [
                  "DNS",
                  "SPF, DMARC and MX records",
                  "missing SPF, missing DMARC, DMARC in monitoring mode",
                ],
                [
                  "HTTP",
                  "HSTS header, HTTP-to-HTTPS redirect, Server banner",
                  "missing HSTS, no redirect, banner disclosure",
                ],
              ] as const
            ).map(([check, method, findings]) => (
              <tr key={check} className="border-b border-line">
                <th
                  scope="row"
                  className="w-28 py-2 pr-4 text-left align-top font-normal text-ink"
                >
                  {check}
                </th>
                <td className="py-2 pr-6 align-top text-muted">{method}</td>
                <td className="py-2 align-top text-muted">{findings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border-t border-line py-10">
        <h2 className="text-base font-medium">Limits</h2>
        <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            There are no accounts. Anything added to this instance is visible
            to everyone holding the URL.
          </li>
          <li>
            Results describe exposure and configuration. They do not establish
            whether a service has an exploitable vulnerability.
          </li>
          <li>
            Run one server process with its SQLite database. Only scan domains
            you own or have permission to scan.
          </li>
        </ul>
      </section>
    </main>
  );
}
