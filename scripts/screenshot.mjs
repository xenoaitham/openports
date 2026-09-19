// captures the full set of screenshots from the real running app, into a
// local folder that stays out of the repo.
// the caller wipes openports.db, migrates, builds and starts the production
// server on 4310 first. OUT picks the output directory.
//
// one staged state, disclosed: the failed scan is a fixture row inserted
// directly into sqlite, because a real scan failure cannot be scheduled.
// findings are never staged, every finding in these shots comes from a real
// scan this script triggered.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:4310";
const OUT = process.env.OUT ?? "shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`${page.url()}: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`${page.url()}: ${err.message}`));

async function shot(name) {
  // park the cursor so a hover state never bleeds into a capture
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`captured ${name}`);
}

async function addDomain(domain) {
  await page.goto(BASE + "/app", { waitUntil: "networkidle" });
  await page.getByLabel("domain to watch").fill(domain);
  await page.getByRole("button", { name: "add target" }).click();
  await page.waitForURL("**/targets/*");
}

// 02: dashboard with nothing in it
await page.goto(BASE + "/app", { waitUntil: "networkidle" });
await shot("02-dashboard-empty");

// 04: the TXT instructions a pending target shows
await addDomain("example.com");
await page.getByText("record value").waitFor();
await shot("04-verify-instructions");

// 05: verification failure, from a real DNS lookup (example.com has no record)
await page.getByRole("button", { name: "check for the record" }).click();
await page.getByText("last check failed").waitFor({ timeout: 30_000 });
await shot("05-verify-failed");

// 06 and 07: queued, then running. enqueueing a second scan while the first
// one holds the worker gives a real queued state to photograph
await addDomain("scanme.nmap.org");
let sawQueued = false;
try {
  await page.getByRole("button", { name: "run scan again" }).click();
  await page.getByText("queued, starting shortly").waitFor({ timeout: 4_000 });
  sawQueued = true;
  await shot("06-scan-queued");
} catch {
  console.log("note: missed the queued state, the worker claimed it too fast");
}
await page
  .getByText(/running: sweeping|queued, starting shortly/)
  .first()
  .waitFor({ timeout: 20_000 });
if (!sawQueued) await shot("06-scan-queued"); // best effort, may show running
await page.getByText(/running: sweeping/).waitFor({ timeout: 20_000 });
await shot("07-scan-running");

// wait for the scan to land
await page
  .getByText(/finished \d|scan failed:/)
  .first()
  .waitFor({ timeout: 90_000 });

// one more scan so the history table has real rows. wait for the queued or
// running sentence first: "finished N ago" is already on the page right
// after the click, so a bare wait for it would match stale content
await page.getByRole("button", { name: "run scan again" }).click();
await page
  .getByText(/queued, starting shortly|running: sweeping/)
  .first()
  .waitFor({ timeout: 20_000 });
await page.getByText(/finished \d/).first().waitFor({ timeout: 90_000 });

// 03: dashboard with data
await page.goto(BASE + "/app", { waitUntil: "networkidle" });
await shot("03-dashboard");

// 09: findings on the demo target
await page.goto(BASE + "/targets/2", { waitUntil: "networkidle" });
await page.getByText(/finished \d/).first().waitFor();
const findingsHeading = page.getByRole("heading", { name: "findings" });
if (await findingsHeading.isVisible()) {
  await findingsHeading.scrollIntoViewIfNeeded();
}
await shot("09-findings");

// 12: the changes feed against the previous scan. scanme's port 80 flaps
// between runs, so there is usually something real to show here
const changesHeading = page.getByRole("heading", {
  name: "changes since the previous scan",
});
if (await changesHeading.isVisible()) {
  await changesHeading.scrollIntoViewIfNeeded();
  await shot("12-changes");
} else {
  console.log("note: no changes section, skipping 12-changes");
}

// 10: scan history
await page.getByRole("heading", { name: "history" }).scrollIntoViewIfNeeded();
await shot("10-history");

// 11: raw scan output, expanded
await page.getByText("raw scan output").click();
await page.getByText('"ports"').first().waitFor();
await shot("11-raw-output");

// 08: scan failed. fixture row, disclosed at the top of this file. stamped
// seconds ago so the history table stays in chronological order
const { default: Database } = await import("better-sqlite3");
const db = new Database("openports.db");
const t = Date.now();
db.prepare(
  "INSERT INTO scans (target_id, status, error, started_at, finished_at, created_at) VALUES (?, 'failed', 'domain does not resolve', ?, ?, ?)",
).run(2, t - 4_000, t - 3_500, t - 4_000);
db.close();
await page.reload({ waitUntil: "networkidle" });
await page.getByText(/scan failed:/).waitFor({ timeout: 10_000 });
await shot("08-scan-failed");

// 01: landing last, so it shows a real finished report from this instance
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.getByText(/finished \d+ ?(s|min|h) ago/).waitFor({
  timeout: 10_000,
});
await shot("01-landing");

await browser.close();

if (errors.length > 0) {
  console.error(`CONSOLE ERRORS (${errors.length}):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("no console errors on any captured page");
