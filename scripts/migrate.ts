import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/db";

migrate(db, { migrationsFolder: "drizzle" });
console.log("database ready");
