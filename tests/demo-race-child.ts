import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { admitDemoScan } from "../src/lib/demo";

const sqlite = new Database(process.argv[2]);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });
console.log(JSON.stringify(admitDemoScan(db, Number(process.argv[3]), Number(process.argv[4])).ok));
sqlite.close();
