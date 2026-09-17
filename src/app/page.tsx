import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "OpenPorts, outside-in monitoring",
  description:
    "Point OpenPorts at a domain and it reports open ports, TLS expiry, mail records and header hygiene. Add a domain, prove it is yours, read the report.",
};

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4">
      <section className="pt-16 pb-10">
        <h1 className="max-w-2xl text-3xl font-semibold leading-snug text-ink">
          See what your servers tell the internet.
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          OpenPorts watches your domains from the outside: which ports answer,
          when the TLS certificate expires, whether anyone can send mail as
          you, and what your headers admit to.
        </p>
        <div className="mt-6 flex items-center gap-5">
          <Link
            href="/app"
            className="rounded border border-accent/50 bg-accent/10 px-4 py-2 font-mono text-sm text-accent hover:bg-accent/20"
          >
            scan your first domain
          </Link>
          <a
            href="https://github.com/xenoaitham/openports"
            className="text-sm text-muted hover:text-ink"
          >
            devlog
          </a>
        </div>
      </section>

      <section>
        <figure className="rounded border border-line bg-panel p-2">
          <img
            src="/report-sample.png"
            alt="OpenPorts report for scanme.nmap.org: one unexpected open port, no SPF record, no DMARC record"
            className="w-full rounded-sm"
          />
        </figure>
        <p className="mt-2 font-mono text-xs text-muted">
          a real report from this build: scanme.nmap.org, 2026-09-18. the nmap
          project leaves that host open to scanning on purpose. results shift a
          little between runs, more on that in the devlog.
        </p>
      </section>

      <section className="py-10">
        <h2 className="text-sm font-medium text-ink">How it works</h2>
        <div className="mt-3 max-w-2xl space-y-3 text-sm text-muted">
          <p>
            You add a domain. It gets resolved once, mostly to say no: anything
            pointing into private address space is rejected before it is even
            stored.
          </p>
          <p>
            You prove the domain is yours by publishing one TXT record at{" "}
            <code className="font-mono text-xs text-ink">
              _openports.your-domain.com
            </code>
            . Nothing is port scanned before that record checks out. The single
            exception is scanme.nmap.org, which the nmap project runs for
            scanner testing.
          </p>
          <p>
            Then it sweeps the 100 ports most likely to be open, reads the
            certificate on 443, checks SPF, DMARC and MX, and looks at the
            headers on the main host. Every finding ships with a fix in plain
            sentences, not a link to a blog post.
          </p>
        </div>
      </section>

      <section className="border-t border-line py-8">
        <h2 className="text-sm font-medium text-ink">Limits</h2>
        <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-sm text-muted">
          <li>No accounts yet. Anyone with the URL sees every target here.</li>
          <li>
            This is a monitor, not an attack tool. It completes TCP handshakes
            and reads what servers volunteer. It never exploits anything.
          </li>
          <li>
            One process, one SQLite file, one scan at a time. Deliberate, until
            the boring way stops working.
          </li>
        </ul>
      </section>
    </main>
  );
}
