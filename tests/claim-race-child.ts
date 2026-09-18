// helper for the claim race test: opens the shared database file this
// process was handed, loops the real claim until it comes up empty, and
// prints the claimed ids as json. never writes anything else.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { claimOneScan } from "../src/lib/claim";

async function main() {
  const dbPath = process.argv[2];
  if (!dbPath) throw new Error("usage: claim-race-child.ts <db file>");
  const db = drizzle(new Database(dbPath), { schema });
  const claimed: number[] = [];
  for (;;) {
    const row = await claimOneScan(db);
    if (!row) break;
    claimed.push(row.id);
  }
  console.log(JSON.stringify(claimed));
}

void main();
