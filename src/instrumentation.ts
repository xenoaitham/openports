// starts the scan worker when the server process boots, so a queued scan
// never sits waiting after a restart
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureWorker } = await import("./lib/worker");
    ensureWorker();
  }
}
