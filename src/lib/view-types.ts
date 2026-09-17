import type { ScanResult } from "./scan-types";
import type { ScanStatus, Severity, TargetStatus } from "./types";

export interface FindingView {
  id: number;
  type: string;
  severity: Severity;
  evidence: Record<string, unknown>;
}

export interface ScanView {
  id: number;
  status: ScanStatus;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  openPorts: number[];
  findingCount: number;
}

export interface TargetView {
  id: number;
  domain: string;
  status: TargetStatus;
  failReason: string | null;
  verifyToken: string;
  createdAt: string;
  verifiedAt: string | null;
}

export interface TargetDetail {
  target: TargetView;
  scans: ScanView[];
  findings: FindingView[];
  rawResult: ScanResult | null;
}

export interface ScanSummary {
  id: number;
  status: ScanStatus;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface TargetOverview {
  id: number;
  domain: string;
  status: TargetStatus;
  failReason: string | null;
  createdAt: string;
  lastScan: ScanSummary | null;
  counts: { high: number; medium: number; low: number; info: number };
  openPorts: number[];
}
