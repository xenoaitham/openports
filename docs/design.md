# Design notes

OpenPorts currently runs as one application process with a SQLite database. It is intended for a small set of domains managed by the person running the instance.

## Storage and workers

SQLite keeps target verification, scan jobs, raw results, and findings together. A separate queue would add another service to deploy and another place to track job state. The worker claims queued rows with an atomic update, so concurrent workers cannot claim the same row.

The pool has three slots. A claim skips targets with a running scan and targets sharing the same stored IP address. That address is refreshed after a successful scan; it is not a complete map of every address a domain might resolve to. Round-robin DNS and address changes can therefore weaken this guard.

This is a single-process deployment model. Starting another instance against the same database can interfere with startup recovery, which marks running jobs as interrupted.

## Scheduling and retention

Verified targets follow a six-hour cadence. Both completed and failed scans count as attempts, preventing a failing target from being retried on every scheduler tick. A queued or running scan blocks another scheduled scan. Manual scans can still be queued.

The latest 100 completed scans are retained per target. Deleting a scan also deletes its findings and stored diff. Failed scans are not pruned by this rule. Older raw results cannot be recovered from the application after pruning; database backups remain the operator's responsibility.

## Change confirmation

The report compares the latest completed scan with the previous one. For a changed port or finding, a third, older scan checks whether the latest state has been seen before. If so, the transition is labeled confirmed; otherwise it remains unconfirmed.

For one port, from oldest to newest:

- `open, closed, open`: the reopening is confirmed because the oldest and newest scans agree.
- `closed, closed, open`: the opening is unconfirmed because it has only been seen once.
- `closed, open, open`: there is no new transition, so the latest changes feed has no entry for that port.

This is a check on the latest transition, not a pending-event queue. An unconfirmed change is not kept in the feed until a later scan confirms it. The stored raw diff remains on its scan row until retention removes that scan. Certificate expiry changes are reported separately without confirmation labels.

The labels keep a short-lived reading visible without treating it as settled. A future persistent alert feed would need to track unresolved transitions across scans rather than recompute only the newest diff.

## Scan boundaries

The worker requires a verified target before scanning; `scanme.nmap.org` is the built-in test exception. TCP probes use a resolved public address. HTTP checks use the hostname, so they can resolve again after the initial check. DNS filtering and TXT verification are not substitutes for authentication or a network boundary.

The tests cover domain normalization, reserved-address filtering, TXT parsing, scan claims, findings, and change confirmation. They do not prove that every network or deployment configuration is safe.

There are no accounts, per-user targets, or API rate limits. The preview is static and cannot start scans. A public interactive deployment would need access controls and scan limits first. OpenPorts reports exposure and configuration issues, not whether a service is exploitable.
