import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:4310"),
  title: {
    default: "OpenPorts, outside-in monitoring",
    template: "%s - OpenPorts",
  },
  description:
    "OpenPorts watches your domains from the outside: open ports, TLS expiry, mail spoofing, header hygiene. Add a domain, prove it is yours, read the report.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="font-mono text-sm tracking-tight text-ink hover:text-accent"
            >
              openports<span className="text-accent">_</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/app" className="text-muted hover:text-ink">
                targets
              </Link>
              <Link
                href="https://github.com/xenoaitham/openports"
                className="text-muted hover:text-ink"
              >
                devlog
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 h-12 flex items-center text-xs text-muted font-mono">
            no accounts yet, one sqlite file, scans only after TXT verification
          </div>
        </footer>
      </body>
    </html>
  );
}
