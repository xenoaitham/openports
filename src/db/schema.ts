import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ScanStatus, Severity, TargetStatus } from "@/lib/types";

export const targets = sqliteTable("targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull().unique(),
  status: text("status").$type<TargetStatus>().notNull().default("pending"),
  verifyToken: text("verify_token").notNull(),
  failReason: text("fail_reason"),
  // the public address this target resolved to, set when the target is
  // added and refreshed by every finished scan. the worker's claim matches
  // on it so two names pointing at one host are never swept at the same
  // time. nullable for rows added before the column existed.
  ip: text("ip"),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const scans = sqliteTable(
  "scans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    targetId: integer("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    status: text("status").$type<ScanStatus>().notNull().default("queued"),
    error: text("error"),
    result: text("result"),
    // what changed against the previous done scan, json, written at
    // completion. display recomputes with hysteresis from the last scans.
    diff: text("diff"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("scans_target_idx").on(t.targetId)],
);

export const findings = sqliteTable(
  "findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    targetId: integer("target_id")
      .notNull()
      .references(() => targets.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").$type<Severity>().notNull(),
    evidence: text("evidence"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("findings_target_idx").on(t.targetId),
    index("findings_scan_idx").on(t.scanId),
  ],
);

export type TargetRow = typeof targets.$inferSelect;
export type ScanRow = typeof scans.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
