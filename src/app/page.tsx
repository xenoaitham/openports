import type { Metadata } from "next";
import Link from "next/link";
import FindingsList from "@/components/findings";
import { getLandingReport } from "@/lib/queries";
import { formatDuration, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OpenPorts, outside-in monitoring",
  description:
    "Point OpenPorts at a domain and it reports open ports, TLS expiry, mail records and header hygiene. Add a domain, prove it is yours, read the report.",
};

const btn =
  "inline-block border border-ink px-3.5 py-2 text-sm text-ink hover:bg-ink hover:text-paper";

export default async function Home() {
  const report = await getLandingReport();

  return (
    <main className="mx-auto max-w-5xl px-4">
      <section className="pb-10 pt-14">
        <h1 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight">
          OpenPorts watches your domains from the outside and reports what
          they expose.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Open ports, a TLS certificate on its way out, mail records that let
          anyone spoof you, headers that give away the stack. Every finding
          comes with the fix, written out.
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
            <p className="mt-1 text-sm text-muted">
              {report.domain}, finished {timeAgo(report.finishedAt)}, took{" "}
              {formatDuration(report.durationMs)}, ports open:{" "}
              <span className="font-mono text-xs text-ink">
                {report.openPorts.join(", ") || "none"}
              </span>
              . The Nmap project runs that host for scanner testing, so it is
              scanned without the ownership record. Nothing on this page is
              staged.
            </p>
            <div className="mt-4">
              <FindingsList findings={report.findings} />
            </div>
          </>
        ) : (
          <p className="mt-2 max-w-2xl text-sm text-muted">
            No scan has finished on this instance yet. Run{" "}
            <code className="font-mono text-xs text-ink">npm run seed</code>{" "}
            to scan scanme.nmap.org for real, or add a domain under targets:
            the latest report then shows up here.
          </p>
        )}
      </section>

      <section className="border-t border-line py-10">
        <h2 className="text-base font-medium">How a scan gets allowed</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Adding a domain never triggers a scan by itself. You prove
          ownership with one DNS record, and the worker rechecks that record
          before it touches the network:
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
                  "the 100 ports most likely to be open, plain connect, nothing sent, no service probing",
                  "remote access port exposed, unexpected open port",
                ],
                [
                  "TLS on 443",
                  "certificate subject, issuer and expiry date",
                  "expired, or expiring in under 30 days",
                ],
                [
                  "DNS",
                  "SPF, DMARC and MX records",
                  "missing SPF, missing DMARC, DMARC in monitoring mode",
                ],
                [
                  "HTTP",
                  "HSTS header, the http to https redirect, Server banner",
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
        <h2 className="text-base font-medium">Limits, stated plainly</h2>
        <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            There are no accounts. Anything added to this instance is visible
            to everyone holding the URL.
          </li>
          <li>
            The scanner is a monitor, not an attack tool. It completes TCP
            handshakes and reads what servers volunteer. It never exploits
            anything.
          </li>
          <li>
            One process, one SQLite file. That is deliberate until the boring
            way stops working.
          </li>
        </ul>
      </section>
    </main>
  );
}
