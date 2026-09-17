import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { scans, targets } from "../src/db/schema";
import { generateToken } from "../src/lib/verify";
import { ensureWorker, enqueueScan } from "../src/lib/worker";

// seeds the one pre-allowed demo target and runs a real scan against it.
// nothing is faked: the scan hits the network, so what the UI shows is what
// came back.
const DEMO = "scanme.nmap.org";

async function main() {
  let [target] = await db
    .select()
    .from(targets)
    .where(eq(targets.domain, DEMO))
    .limit(1);
  if (!target) {
    [target] = await db
      .insert(targets)
      .values({
        domain: DEMO,
        verifyToken: generateToken(),
        status: "verified",
        verifiedAt: new Date(),
      })
      .returning();
    console.log(`added ${DEMO} as the pre-allowed demo target`);
  }

  const existing = await db
    .select({ id: scans.id })
    .from(scans)
    .where(eq(scans.targetId, target.id));
  if (existing.length === 0) {
    await enqueueScan(target.id);
    console.log("queued a scan");
  }

  const started = Date.now();
  for (;;) {
    const rows = await db
      .select()
      .from(scans)
      .where(eq(scans.targetId, target.id));
    const scan = rows[rows.length - 1];
    if (scan && (scan.status === "done" || scan.status === "failed")) {
      console.log(`scan ${scan.status}${scan.error ? `: ${scan.error}` : ""}`);
      console.log(`open http://localhost:4310/targets/${target.id}`);
      process.exit(scan.status === "done" ? 0 : 1);
    }
    if (Date.now() - started > 90_000) {
      console.log("timed out waiting for the scan");
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

ensureWorker();
void main();
