import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ScanStatus, Severity, TargetStatus } from "@/lib/types";

export const targets = sqliteTable("targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull().unique(),
  status: text("status").$type<TargetStatus>().notNull().default("pending"),
  verifyToken: text("verify_token").notNull(),
  failReason: text("fail_reason"),
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
