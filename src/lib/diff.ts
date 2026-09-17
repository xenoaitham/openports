import type { ScanResult } from "./scan-types";

// scan diff: what changed between the previous done scan and this one.
// pure functions, same input, same output, no database, no network.

export interface ScanDiff {
  portsOpened: { port: number; confirmed: boolean }[];
  portsClosed: { port: number; confirmed: boolean }[];
  findingsNew: { type: string; confirmed: boolean }[];
  findingsResolved: { type: string; confirmed: boolean }[];
  certExpiryChanged: { from: string; to: string } | null;
}

export interface DiffInput {
  result: ScanResult | null;
  findingTypes: string[];
}

function openPorts(input: DiffInput): Set<number> {
  return new Set(input.result?.ports?.open ?? []);
}

// the raw change set between two scans, no hysteresis labels. this is what
// the worker stores as the audit trail.
export function diffScanOutputs(prev: DiffInput, current: DiffInput): ScanDiff {
  return rawDiff(prev, current);
}

function rawDiff(prev: DiffInput, current: DiffInput): ScanDiff {
  const prevPorts = openPorts(prev);
  const curPorts = openPorts(current);
  const prevTypes = new Set(prev.findingTypes);
  const curTypes = new Set(current.findingTypes);

  const certExpiryChanged = (() => {
    const from = prev.result?.tls?.validTo;
    const to = current.result?.tls?.validTo;
    // a renewal shows up as a new expiry date. missing certs on either side
    // are not a change, they are a hole in the data.
    if (!from || !to || from === to) return null;
    return { from, to };
  })();

  return {
    portsOpened: [...curPorts]
      .filter((p) => !prevPorts.has(p))
      .sort((a, b) => a - b)
      .map((port) => ({ port, confirmed: false })),
    portsClosed: [...prevPorts]
      .filter((p) => !curPorts.has(p))
      .sort((a, b) => a - b)
      .map((port) => ({ port, confirmed: false })),
    findingsNew: [...curTypes]
      .filter((t) => !prevTypes.has(t))
      .sort()
      .map((type) => ({ type, confirmed: false })),
    findingsResolved: [...prevTypes]
      .filter((t) => !curTypes.has(t))
      .sort()
      .map((type) => ({ type, confirmed: false })),
    certExpiryChanged,
  };
}

// hysteresis. scanme's port 80 flips between runs, so a raw diff would cry
// wolf on every scan. the call: a change is announced immediately but marked
// unconfirmed until the scans agree. a change counts as confirmed when the
// new state is already visible in the scan before the previous one, meaning
// two of the last three scans agree on it. that covers both directions: a
// state that held for two consecutive scans, and a one-scan flap that
// reverted. announcing only confirmed changes instead would hide a real
// opened port for a whole scan cycle, which is the worst trade for a
// monitor. the label carries the doubt instead.
export function diffWithHysteresis(
  prevPrev: DiffInput | null,
  prev: DiffInput,
  current: DiffInput,
): ScanDiff {
  const diff = rawDiff(prev, current);
  if (!prevPrev) return diff;

  const ppPorts = openPorts(prevPrev);
  const ppTypes = new Set(prevPrev.findingTypes);

  diff.portsOpened = diff.portsOpened.map((it) => ({
    ...it,
    confirmed: ppPorts.has(it.port),
  }));
  diff.portsClosed = diff.portsClosed.map((it) => ({
    ...it,
    confirmed: !ppPorts.has(it.port),
  }));
  diff.findingsNew = diff.findingsNew.map((it) => ({
    ...it,
    confirmed: ppTypes.has(it.type),
  }));
  diff.findingsResolved = diff.findingsResolved.map((it) => ({
    ...it,
    confirmed: !ppTypes.has(it.type),
  }));
  return diff;
}

export function diffIsEmpty(diff: ScanDiff): boolean {
  return (
    diff.portsOpened.length === 0 &&
    diff.portsClosed.length === 0 &&
    diff.findingsNew.length === 0 &&
    diff.findingsResolved.length === 0 &&
    diff.certExpiryChanged === null
  );
}
