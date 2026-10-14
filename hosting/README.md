# Demo entry page

This Firebase Hosting site opens the running OpenPorts app in a full-height frame. The server and SQLite database run on the owner's machine, reached through a Cloudflare quick tunnel. The Firebase URL stays the same, but the app is available only while the machine, server, and tunnel are running.

`site.json` contains public identifiers for the separate OpenPorts Hosting site. The site's Google project also contains another application; this deployment script checks the exact site resource and never deploys to that project's default site.

Deploy using Node 22 or newer and an authenticated Google Cloud CLI:

```sh
GCLOUD_BIN=/home/potato/google-cloud-sdk/bin/gcloud node hosting/deploy.mjs \
  --project bell-blitz \
  --site openports-live-xenoaitham \
  --origin https://YOUR-TUNNEL.trycloudflare.com \
  --dry-run
```

Use the actual running tunnel origin, then remove `--dry-run` to publish. Dry runs do not request credentials or change remote resources. The script accepts only HTTPS quick-tunnel origins, verifies that the Google project has no billing account, uploads the compressed page through Firebase's Hosting REST API, and releases the finalized version. It keeps access tokens in memory.

The HTML template contains an origin placeholder and must not be published directly with the Firebase CLI.

## Keep the tunnel running

`run-tunnel.mjs` starts a quick tunnel to the existing server on `127.0.0.1:4387`. It waits for the public targets endpoint, then publishes the current origin to Firebase. It retries failed deployments five times. If the tunnel stops, the process exits so systemd starts another tunnel and publishes its new origin. It does not start scans or change the database.

The checked-in unit uses this machine's paths. Update `WorkingDirectory`, `ExecStart`, `GCLOUD_BIN`, and `CLOUDFLARED_BIN` before installing it on another machine. Keep the Docker demo running independently.

Link and enable the user service:

```sh
systemctl --user link /home/potato/Saas/openports/hosting/openports-demo.service
systemctl --user daemon-reload
systemctl --user enable --now openports-demo.service
```

Check or restart it:

```sh
systemctl --user status openports-demo.service
journalctl --user -u openports-demo.service -n 30
systemctl --user restart openports-demo.service
```

Stop it with `systemctl --user stop openports-demo.service`. A user service normally stops after the last login session ends. To keep it running after logout, enable lingering for the service owner with `loginctl enable-linger potato`; this may need administrator approval. Lingering does not keep the machine online during shutdown or sleep. If Google Cloud authentication expires or is revoked, sign in again and restart the service.

Deployment API: <https://firebase.google.com/docs/hosting/api-deploy>
