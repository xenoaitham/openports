# OpenPorts

OpenPorts watches domains from the outside and reports what they expose to the internet: open ports, TLS certificates that are expired or about to be, mail records that allow spoofing, headers that leak the stack.

Small companies should not need a security team to answer one question: what does the internet see when it looks at us?

## Current state

- The core loop works. Add a domain, prove ownership by publishing one TXT record, get scanned, read findings with a fix written out for each one.
- Every open port gets one short conversation after the sweep: listen for a greeting, one http GET if the port stays quiet, certificate subject on the TLS ports. A port that says nothing is reported as "no banner".
- Certificate checks run on 443 and the mail ports 465, 993 and 995 whenever they answer: subject, issuer, expiry. Validation stays on, so an expired, self-signed or mismatched certificate shows up as a rejected handshake and is reported as a finding from the catalog.
- Each scan is diffed against the previous one: ports opened or closed, findings new or resolved, certificate expiry changed. A change is marked unconfirmed until the next scan sees the same thing, so a flapping port does not cry wolf.
- Verified targets are rescanned on a fixed cadence, every 6 hours, with no per target config. The worker rechecks verification before every scan, scheduled or not, and a scheduled rescan never queues up behind a scan that has not run yet.
- There is no auth yet. Anyone using your instance sees every target, so run it locally or behind something that gates access.
- One process, one SQLite file (through Drizzle), the scan worker is an interval in that same process. No queue, no redis, no docker.
- Active scanning, the TCP port sweep, runs only against targets that passed the TXT check. The single exception is scanme.nmap.org, which the Nmap project runs for scanner testing. Passive DNS checks are safe and run before that.
- The finding catalog and the code that derives findings from scan output live in plain modules with no UI imports, so the future public report page can reuse them without a refactor.

## Run it

```
npm install
npm run dev
```

Open http://localhost:4310. The database is created and migrated on start.

Optional demo data: `npm run seed` adds scanme.nmap.org and runs a real scan against it. Nothing is faked, so results vary a little between runs.

Tests: `npm test`.
