# Running a live demo

The application needs a Node.js server with outbound TCP and a persistent SQLite file. GitHub Pages serves the preview only; it cannot run the scanner.

The [public demo](https://openports-live-xenoaitham.web.app) uses Firebase Hosting as its entry page and loads the running application through a tunnel. The scanner and persistent database run in an isolated container on the owner's machine. This is a live application, but it is not an always-on cloud backend. See [hosting setup](../hosting/README.md) for its service and deployment commands.

Set `OPENPORTS_DEMO_MODE=1` for an instance that anyone can access. This mode uses `scanme.nmap.org` as its only target. Visitors can browse reports, open raw output, and request a new scan when the shared six-hour interval allows it. Adding, deleting, or verifying targets is disabled at the API as well as in the interface.

The scan limit is stored in SQLite. Queued and running scans block another request; completed and failed attempts reset the interval. Restarting the process does not reset the limit. Keep the same database file across deployments and run one server process. Do not attach a personal instance's database: startup rejects other targets and existing job backlogs.

## Container deployment

```sh
docker build -t openports-demo .
docker run -d --name openports-demo --restart unless-stopped \
  -p 127.0.0.1:4310:4310 \
  -v openports-demo-data:/data \
  openports-demo
```

Put an HTTPS reverse proxy or a named tunnel in front of port 4310. The image applies migrations before starting the server. Its database lives under `/data`; mount a persistent volume there. `PORT` can be changed for a hosting provider's assigned port.

The default container is the restricted demo. For a personal instance, explicitly set `OPENPORTS_DEMO_MODE=0` and restrict access externally. Normal mode has no built-in authentication or API rate limits.

## Direct Node.js deployment

```sh
npm ci
npm run build
DB_PATH=/path/to/demo.db node --import tsx scripts/migrate.ts
DB_PATH=/path/to/demo.db OPENPORTS_DEMO_MODE=1 npm start
```

The database directory must exist and be writable. Demo startup adds the allowed target and queues the initial scan if the interval permits it. Public demo requests do not use the operator's production database.

Anonymous quick tunnels are temporary: the hostname changes when the tunnel restarts, and the service depends on the local machine remaining online. Use a persistent host and a named domain for a durable demo URL.
