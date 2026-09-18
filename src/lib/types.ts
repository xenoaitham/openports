// a target is pending until its TXT record checks out. a failed check is
// not a status: the reason is recorded on the row and the target stays
// pending, because not having published the record yet is the normal state.
export type TargetStatus = "pending" | "verified";
export type ScanStatus = "queued" | "running" | "done" | "failed";
export type Severity = "high" | "medium" | "low" | "info";
