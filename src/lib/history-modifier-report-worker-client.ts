export function createHistoryModifierReportWorker(): Worker {
  return new Worker(new URL("/workers/history-modifier-report.worker.js", window.location.href), {
    name: "history-modifier-report",
  });
}
