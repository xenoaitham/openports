import { test } from "node:test";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

test("public demo rejects mutations and reports shared cooldown without network scans", async () => {
  process.env.DB_PATH = ":memory:";
  process.env.OPENPORTS_DEMO_MODE = "1";
  try {
    const { db } = await import("../src/db");
    const { prepareDemoTarget } = await import("../src/lib/demo");
    const { targets, scans } = await import("../src/db/schema");
    const queries = await import("../src/lib/queries");
    const collection = await import("../src/app/api/targets/route");
    const targetRoute = await import("../src/app/api/targets/[id]/route");
    const verifyRoute = await import("../src/app/api/targets/[id]/verify/route");
    const rescanRoute = await import("../src/app/api/targets/[id]/rescan/route");
    migrate(db, { migrationsFolder: "drizzle" });
    const id = prepareDemoTarget(db);
    db.insert(scans).values({ targetId: id, status: "failed", finishedAt: new Date() }).run();
    const [foreign] = db.insert(targets).values({ domain: "example.com", verifyToken: "private-token", status: "verified" }).returning().all();
    const context = { params: Promise.resolve({ id: String(id) }) };
    const request = new Request("http://localhost/api/targets", { method: "POST", body: "invalid" });
    assert.equal((await collection.POST(request)).status, 403);
    assert.equal((await targetRoute.DELETE(request, context)).status, 403);
    assert.equal((await verifyRoute.POST(request, context)).status, 403);
    assert.equal((await queries.createTarget("example.net")).ok, false);
    assert.equal((await queries.verifyTarget(id)).ok, false);
    await assert.rejects(() => queries.deleteTarget(id), /does not allow target changes/);
    assert.equal((await queries.rescanTarget(foreign.id)).ok, false);
    assert.equal(await queries.getTargetDetail(foreign.id), null);
    assert.deepEqual((await queries.listTargetOverviews()).map(row => row.domain), ["scanme.nmap.org"]);
    const response = await rescanRoute.POST(request, context);
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(response.headers.get("Retry-After"), String(body.retryAfterSeconds));
    assert.ok(body.retryAfterSeconds > 0 && body.retryAfterSeconds <= 21_600);
    assert.equal(db.select().from(scans).all().length, 1);
    assert.equal(db.select().from(targets).all().length, 2);
    delete process.env.OPENPORTS_DEMO_MODE;
    assert.equal((await queries.verifyTarget(id)).ok, true);
    await queries.deleteTarget(foreign.id);
    assert.equal(db.select().from(targets).all().length, 1);
  } finally {
    delete process.env.OPENPORTS_DEMO_MODE;
  }
});
