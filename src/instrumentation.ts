// Release interrupted scans before starting the scheduler after a restart.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { failInterruptedScans } = await import("./lib/claim");
    const { ensureWorker } = await import("./lib/worker");
    const { db } = await import("./db");
    await failInterruptedScans(db);
    ensureWorker();
  }
}
