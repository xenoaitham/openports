// starts the scan worker when the server process boots, so a queued scan
// never sits waiting after a restart. scans caught mid flight by a restart
// are marked failed first, so the scheduler does not wait on them forever.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureWorker, failInterruptedScans } = await import(
      "./lib/worker"
    );
    await failInterruptedScans();
    ensureWorker();
  }
}
