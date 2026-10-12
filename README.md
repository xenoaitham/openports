# OpenPorts

OpenPorts checks what a domain exposes to the internet and keeps a history of changes. It reports open ports, certificate problems, missing mail records, and HTTP configuration issues, with evidence and a suggested fix for each finding.

The app runs as one Next.js process with a SQLite database. There is no separate queue service.

## Run locally

Use Node.js 22.

```sh
npm ci
npm run dev
```

Open <http://localhost:4310>. The development command creates the database and applies migrations before starting the server.

Add a domain, publish the TXT record shown on its page, and check ownership. Scanning starts after verification. `scanme.nmap.org` is the built-in exception for testing.

For a real demo scan:

```sh
npm run seed
```

Results depend on what the target returns. A [screenshot preview](https://xenoaitham.github.io/openports) is also available.

## Checks

- A TCP sweep of 100 common ports, followed by short service-banner checks.
- TLS certificate checks on open ports 443, 465, 993, and 995. Certificate validation stays enabled.
- SPF, DMARC, and MX records.
- HTTP redirects, HSTS, and server headers.
- Changes to open ports, findings, and certificate expiry dates. Port and finding changes use the last three completed scans to distinguish confirmed changes from one-off results.

Verified targets are scanned every six hours. Failed attempts also reset that interval. Up to three scans run at once; targets sharing the same stored IP address are scanned one at a time.

Each target keeps its latest 100 completed scans. Removing older scans also removes their findings and stored diffs. Failed scans are kept separately.

## Commands

```sh
npm test          # Run regression tests
npm run db:migrate
npm run build
npm start         # Serve the production build on port 4310
```

Apply migrations before starting a production deployment. `npm start` does not run them.

The database defaults to `openports.db` in the project directory. Set `DB_PATH` to use another location:

```sh
DB_PATH=/path/to/openports.db npm run dev
```

Use the same `DB_PATH` for migrations and the server. Back up the database before replacing or moving it.

## Deployment limits

There is no login or user isolation. Anyone with access to an instance can view and manage its targets. Keep it local or put it behind an access-controlled proxy.

Ownership verification is required for active scans, except for the demo target. Domains resolving to private or reserved addresses are rejected.

## Code layout

- `src/app`: pages and API routes.
- `src/components`: forms, scan reports, and live updates.
- `src/lib`: scanning, verification, finding rules, scheduling, and report queries.
- `src/db` and `drizzle`: schema and migrations.
- `tests`: regression tests, including scan-claim concurrency and report rendering.
