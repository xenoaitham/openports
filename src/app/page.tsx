import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-24">
      <h1 className="font-mono text-3xl text-ink">OpenPorts</h1>
      <p className="mt-4 max-w-xl text-muted">
        Watches your domains from the outside. Under construction.
      </p>
      <Link
        href="/app"
        className="inline-block mt-8 rounded border border-line bg-panel px-4 py-2 font-mono text-sm text-accent hover:border-accent"
      >
        open the app
      </Link>
    </main>
  );
}
