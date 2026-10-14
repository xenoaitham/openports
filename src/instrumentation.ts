// Release interrupted scans before starting the scheduler after a restart.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { failInterruptedScans } = await import("./lib/claim");
    const { ensureWorker } = await import("./lib/worker");
    const { db } = await import("./db");
    const { isPublicDemo, prepareDemoTarget } = await import("./lib/demo");
    // Validate before recovery modifies the database. Validate again after recovery
    // so a queued scan cannot follow an interrupted attempt inside the cooldown.
    const targetId = isPublicDemo() ? prepareDemoTarget(db) : null;
    await failInterruptedScans(db);
    if (targetId !== null) {
      prepareDemoTarget(db);
      const { enqueueScan } = await import("./lib/worker");
      await enqueueScan(targetId);
    }
    ensureWorker();
  }
}
