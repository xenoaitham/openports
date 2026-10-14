#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const run = promisify(execFile);
const args = process.argv.slice(2);
const allowed = new Set(['--project', '--site', '--origin', '--dry-run']);
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (!allowed.has(key) || Object.hasOwn(options, key)) throw new Error(`Unknown or repeated option: ${key}`);
  if (key === '--dry-run') options[key] = true;
  else {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${key}`);
    options[key] = args[++i];
  }
}
const project = options['--project'];
const site = options['--site'];
const expected = JSON.parse(await readFile(new URL('./site.json', import.meta.url), 'utf8'));
if (project !== expected.projectId || site !== expected.siteId) throw new Error('Project and site must match hosting/site.json.');
const origin = new URL(options['--origin'] ?? '');
if (origin.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(origin.hostname)
  || origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('--origin must be an HTTPS *.trycloudflare.com origin without a path or credentials.');
}
const html = (await readFile(new URL('./index.html', import.meta.url), 'utf8')).replaceAll('__APP_ORIGIN__', origin.origin);
if (html.includes('__APP_ORIGIN__')) throw new Error('Unresolved origin placeholder.');
const compressed = gzipSync(Buffer.from(html), { level: 9 });
const hash = createHash('sha256').update(compressed).digest('hex');
if (options['--dry-run']) {
  console.log(JSON.stringify({ project, site, origin: origin.origin, files: { '/index.html': hash }, gzipBytes: compressed.length }, null, 2));
  process.exit(0);
}

// Keep the access token in memory; never put it in command arguments or files.
const { stdout } = await run(process.env.GCLOUD_BIN ?? 'gcloud', ['auth', 'print-access-token', '--project', project], { maxBuffer: 1024 * 1024 });
const token = stdout.trim();
if (!token || /\s/.test(token)) throw new Error('gcloud did not return a valid access token.');
const hosting = 'https://firebasehosting.googleapis.com/v1beta1/';
async function request(url, method = 'GET', body) {
  const address = new URL(url);
  if (!['firebasehosting.googleapis.com', 'upload-firebasehosting.googleapis.com', 'firebase.googleapis.com', 'cloudbilling.googleapis.com'].includes(address.hostname)
    || address.protocol !== 'https:') throw new Error('Unexpected API host.');
  const response = await fetch(address, {
    method, headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': project, ...(body === undefined ? {} : { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' }) },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Firebase request failed (${response.status}): ${(await response.text()).slice(0, 1000)}`);
  const text = await response.text();
  if (Buffer.isBuffer(body)) return {};
  return text ? JSON.parse(text) : {};
}
const billing = await request(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`);
if (billing.billingEnabled || billing.billingAccountName) throw new Error('This helper only deploys to projects without billing.');
const listing = await request(`${hosting}projects/${project}/sites`);
const resource = listing.sites?.find(item => item.name === expected.siteResource);
if (!resource || resource.type !== 'USER_SITE') throw new Error('Isolated demo site not found in this project.');
const version = await request(`${hosting}sites/${site}/versions`, 'POST', {
  config: { headers: [{ glob: '**', headers: {
    'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; frame-src ${origin.origin}; base-uri 'none'; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer',
  } }] },
});
if (!version.name?.startsWith(`sites/${site}/versions/`)) throw new Error('Unexpected version resource.');
const populated = await request(`${hosting}${version.name}:populateFiles`, 'POST', { files: { '/index.html': hash } });
if (populated.uploadRequiredHashes?.length) {
  const upload = new URL(populated.uploadUrl);
  if (upload.origin !== 'https://upload-firebasehosting.googleapis.com'
    || upload.pathname !== `/upload/${version.name}/files` || upload.search || upload.hash) {
    throw new Error('Unexpected upload resource.');
  }
}
for (const requiredHash of populated.uploadRequiredHashes ?? []) {
  if (requiredHash !== hash) throw new Error('Unexpected upload hash.');
  await request(`${populated.uploadUrl}/${hash}`, 'POST', compressed);
}
const finalized = await request(`${hosting}${version.name}?updateMask=status`, 'PATCH', { status: 'FINALIZED' });
if (finalized.status !== 'FINALIZED') throw new Error('Version was not finalized.');
const release = await request(`${hosting}sites/${site}/releases?versionName=${encodeURIComponent(version.name)}`, 'POST', {});
console.log(JSON.stringify({ project, site: resource.name, url: resource.defaultUrl, release: release.name, billingEnabled: false }, null, 2));
