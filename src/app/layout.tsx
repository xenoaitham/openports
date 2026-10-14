import type { Metadata } from "next";
import Link from "next/link";
import { isPublicDemo } from "@/lib/demo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:4310"),
  title: {
    default: "OpenPorts: domain exposure monitoring",
    template: "%s - OpenPorts",
  },
  description:
    "Monitor public ports, certificate validity, DNS mail records, and HTTP configuration for domains you manage.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="mx-auto max-w-5xl px-4 h-12 flex items-center justify-between">
            <Link href="/" className="text-sm font-medium text-ink">
              openports
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/app" className="text-muted hover:text-ink">
                targets
              </Link>
            </nav>
          </div>
        </header>
        {isPublicDemo() && (
          <aside className="border-b border-line bg-paper px-4 py-3 text-sm">
            <div className="mx-auto max-w-5xl">
              Shared live demo: scanme.nmap.org only. Scans are limited to one
              every six hours across all visitors. Reports are public.
            </div>
          </aside>
        )}
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-5xl px-4 h-11 flex items-center text-xs text-muted">
            {isPublicDemo()
              ? "Public demo. Target changes are disabled."
              : "Single-instance monitor. No built-in authentication."}
          </div>
        </footer>
      </body>
    </html>
  );
}
