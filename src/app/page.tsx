import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "OpenPorts, outside-in monitoring",
  description:
    "Point OpenPorts at a domain and it reports open ports, TLS expiry, mail records and header hygiene. Add a domain, prove it is yours, read the report.",
};

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4">
      <section className="py-20">
        <h1 className="max-w-2xl font-mono text-4xl leading-tight text-ink">
          See what your servers tell the internet<span className="text-accent">.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          OpenPorts watches your domains from the outside. Which ports answer,
          whether your TLS certificate is about to expire, if anyone can send
          mail that pretends to be you, and what your headers give away.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/app"
            className="rounded border border-accent/50 bg-accent/10 px-5 py-2.5 font-mono text-sm text-accent hover:bg-accent/20"
          >
            add your first domain
          </Link>
          <a
            href="https://github.com/xenoaitham/openports"
            className="font-mono text-sm text-muted hover:text-ink"
          >
            read the devlog
          </a>
        </div>
      </section>

      <section className="border-t border-line py-14">
        <h2 className="font-mono text-sm uppercase tracking-wide text-muted">
          how it works
        </h2>
        <ol className="mt-6 max-w-3xl space-y-8">
          <li className="flex gap-5">
            <span className="font-mono text-sm text-accent">01</span>
            <div>
              <h3 className="font-medium text-ink">Add a domain</h3>
              <p className="mt-1 text-sm text-muted">
                It gets resolved once, mostly to refuse: targets that point
                into private networks are rejected on sight.
              </p>
            </div>
          </li>
          <li className="flex gap-5">
            <span className="font-mono text-sm text-accent">02</span>
            <div>
              <h3 className="font-medium text-ink">Prove it is yours</h3>
              <p className="mt-1 text-sm text-muted">
                Publish one TXT record at{" "}
                <code className="font-mono text-xs text-ink">
                  _openports.your-domain.com
                </code>
                . Until that record checks out, nothing is scanned. The single
                exception is scanme.nmap.org, which the Nmap project runs for
                scanner testing.
              </p>
            </div>
          </li>
          <li className="flex gap-5">
            <span className="font-mono text-sm text-accent">03</span>
            <div>
              <h3 className="font-medium text-ink">Read the report</h3>
              <p className="mt-1 text-sm text-muted">
                A TCP sweep of the 100 ports most likely to be open, the
                certificate on 443, SPF, DMARC and MX, and the headers on the
                main host. Every finding comes with a fix, written out, not a
                link to a blog post.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="border-t border-line py-14">
        <h2 className="font-mono text-sm uppercase tracking-wide text-muted">
          what a scan looks at
        </h2>
        <ul className="mt-6 grid max-w-3xl gap-2 font-mono text-sm text-muted sm:grid-cols-2">
          <li>open ports, connect sweep only, no service probing</li>
          <li>TLS certificate issuer and expiry date</li>
          <li>SPF, DMARC and MX records</li>
          <li>HSTS, http to https redirect, server banner</li>
        </ul>
      </section>

      <section className="border-t border-line py-14">
        <div className="max-w-3xl rounded border border-line bg-panel p-6">
          <h2 className="font-mono text-sm text-ink">the honest part</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
            <li>
              There are no accounts yet. Anything added to this instance is
              visible to everyone holding the URL.
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
        </div>
      </section>
    </main>
  );
}
