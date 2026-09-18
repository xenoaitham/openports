// starts the scan worker when the server process boots, so a queued scan
// never sits waiting after a restart. scans caught mid flight by a restart
// are marked failed first, all of them, so the scheduler does not wait on
// stuck rows forever.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { failInterruptedScans } = await import("./lib/claim");
    const { ensureWorker } = await import("./lib/worker");
    const { db } = await import("./db");
    await failInterruptedScans(db);
    ensureWorker();
  }
}
