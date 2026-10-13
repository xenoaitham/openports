# Security policy

## Reporting a problem

Use [GitHub's private reporting form](https://github.com/xenoaitham/openports/security/advisories/new) for vulnerabilities. Do not put exploit details, credentials, or private target data in a public issue.

Include the affected commit or version, steps to reproduce on a system you control, the expected behavior, and the impact. Small reproductions are more useful than scans of someone else's infrastructure.

The project is maintained on a best-effort basis. There is no guaranteed response time or separate support schedule for older releases. Report problems against the current main branch when possible.

## Running an instance

Only scan domains you own or have explicit permission to scan. The built-in demo exception is for occasional testing, not repeated public scanning.

OpenPorts has no authentication, user isolation, or API rate limits. Keep it local or behind an access-controlled proxy. Keep the database and environment files private. Domain verification does not protect the application from unauthorized users who can reach its API.

For implementation limits, see [the design notes](docs/design.md).
