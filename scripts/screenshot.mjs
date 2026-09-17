// captures devlog screenshots from the real running app.
// usage: npm run dev in one shell, then: node scripts/screenshot.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:4310";
const OUT = "devlog/img";
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

// 1: landing
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/01-landing.png` });
console.log("captured 01-landing.png");

// 2: verification instructions for a pending domain
await page.goto(BASE + "/app", { waitUntil: "networkidle" });
await page.getByLabel("domain to watch").fill("example.com");
await page.getByRole("button", { name: "add target" }).click();
await page.waitForURL("**/targets/*");
await page.getByText("record value").waitFor();
await page.screenshot({ path: `${OUT}/02-verify-instructions.png` });
console.log("captured 02-verify-instructions.png");

// 3: the demo target starts scanning right away
await page.goto(BASE + "/app", { waitUntil: "networkidle" });
await page.getByLabel("domain to watch").fill("scanme.nmap.org");
await page.getByRole("button", { name: "add target" }).click();
await page.waitForURL("**/targets/*");
await page.getByText("latest scan", { exact: false }).waitFor();
await page.screenshot({ path: `${OUT}/03-scan-running.png` });
console.log("captured 03-scan-running.png");

// 4: wait for the scan to finish, then capture the findings
await page
  .getByText(/finished \d|scan failed:/)
  .first()
  .waitFor({ timeout: 90_000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/04-findings.png` });
console.log("captured 04-findings.png");

await browser.close();

if (errors.length > 0) {
  console.error(`CONSOLE ERRORS (${errors.length}):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("no console errors");
