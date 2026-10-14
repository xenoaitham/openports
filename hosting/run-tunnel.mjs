#!/usr/bin/env node
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const controller = new AbortController();
let stopping = false;
const tunnel = spawn(process.env.CLOUDFLARED_BIN ?? 'cloudflared', [
  'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:4387',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let resolveOrigin;
const originReady = new Promise(resolve => { resolveOrigin = resolve; });
let output = '';
for (const stream of [tunnel.stdout, tunnel.stderr]) {
  stream.on('data', chunk => {
    output = (output + chunk.toString()).slice(-4096);
    const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
    if (match) resolveOrigin(match[0]);
  });
}
const ended = new Promise(resolve => {
  tunnel.once('close', (code, signal) => {
    if (!stopping) controller.abort(new Error(`Tunnel stopped (${signal ?? code}).`));
    resolve();
  });
});
tunnel.once('error', () => controller.abort(new Error('Could not start cloudflared. Check CLOUDFLARED_BIN.')));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    stopping = true;
    controller.abort();
    tunnel.kill('SIGTERM');
  });
}

try {
  const origin = await Promise.race([
    originReady,
    delay(120000, undefined, { signal: controller.signal }).then(() => { throw new Error('Tunnel startup timed out.'); }),
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    controller.signal.throwIfAborted();
    try {
      const response = await fetch(`${origin}/api/targets`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        redirect: 'error',
      });
      if (response.ok && Array.isArray(await response.json())) { ready = true; break; }
    } catch {
      controller.signal.throwIfAborted();
    }
    await delay(2000, undefined, { signal: controller.signal });
  }
  if (!ready) throw new Error('Public demo endpoint did not become ready.');
  const site = JSON.parse(await readFile(new URL('./site.json', import.meta.url), 'utf8'));
  let published = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    controller.signal.throwIfAborted();
    try {
      await run(process.execPath, [fileURLToPath(new URL('./deploy.mjs', import.meta.url)),
        '--project', site.projectId, '--site', site.siteId, '--origin', origin,
      ], { signal: controller.signal, timeout: 180000, maxBuffer: 1024 * 1024 });
      published = true;
      console.log(`Live demo ready: ${site.defaultUrl} (${origin})`);
      break;
    } catch {
      controller.signal.throwIfAborted();
      console.error(`Hosting deployment attempt ${attempt} failed. Check Google Cloud authentication and Firebase access.`);
      if (attempt < 5) await delay(10000, undefined, { signal: controller.signal });
    }
  }
  if (!published) throw new Error('Hosting deployment failed after five attempts.');
  await ended;
  controller.signal.throwIfAborted();
} catch (error) {
  if (!stopping) {
    console.error(controller.signal.aborted ? controller.signal.reason.message : error.message);
    process.exitCode = 1;
  }
} finally {
  controller.abort();
  tunnel.kill('SIGTERM');
}
