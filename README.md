# OpenPorts

I started OpenPorts because I wanted to build a cybersecurity SaaS. This version is a domain-exposure monitor: it checks open ports and configuration, records changes, and suggests fixes. It does not test for exploitable vulnerabilities.

For now, it is a single-instance tool without accounts. Run it locally or behind an access-controlled proxy. [Preview](https://xenoaitham.github.io/openports).

## Run locally

Use Node.js 22.

```sh
npm ci
npm run dev
```

Open <http://localhost:4310>. The development command creates the database and applies migrations before starting the server.

Add a domain, publish the TXT record shown on its page, and check ownership. Scanning starts after verification. `scanme.nmap.org` is the built-in exception for testing.

Only scan domains you own or have explicit permission to scan. To try the built-in test target:

```sh
npm run seed
```

This sends network traffic to `scanme.nmap.org`. Avoid repeated scans; results vary between runs.

## Checks

- A TCP sweep of 100 common ports, followed by short service-banner checks.
- TLS certificate checks on open ports 443, 465, 993, and 995. Certificate validation stays enabled.
- SPF, DMARC, and MX records.
- HTTP redirects, HSTS, and server headers.
- Changes to open ports, findings, and certificate expiry dates. The latest transition is labeled confirmed when the same state appeared two scans earlier. See [design notes](docs/design.md) for examples and limits.

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

Ownership verification is required for active scans, except for the demo target. The scanner filters private and reserved addresses and rejects domains with no public address.

## Project notes

[Design](docs/design.md) covers storage, scheduling, and change confirmation. Report security issues through the channel in [SECURITY.md](SECURITY.md). The code is available under the [MIT license](LICENSE).
