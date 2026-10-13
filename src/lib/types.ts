// Failed TXT checks leave the target pending; failReason stores the last error.
export type TargetStatus = "pending" | "verified";
export type ScanStatus = "queued" | "running" | "done" | "failed";
export type Severity = "high" | "medium" | "low" | "info";
