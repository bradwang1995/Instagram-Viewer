import { personalUrl, localServiceEnabled } from "./personalMedia";
import type { LoadOutcome } from "./loadReport";

const pending = new Map<string, LoadOutcome>();
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;
let status = "No local results recorded yet.";
let visit = "";
export function localLogStatus() {
  return status;
}
function setStatus(next: string) {
  status = next;
  window.dispatchEvent(new Event("viewer:local-log-updated"));
}
function enabled() {
  return import.meta.env.MODE === "personal" || localServiceEnabled();
}
function schedule(delay = 2000) {
  timer ??= setTimeout(() => {
    timer = undefined;
    void flushLocalLoadLog();
  }, delay);
}
export function queueLocalLoadLog(row: LoadOutcome, session: string) {
  if (row.source !== "local" || !enabled()) return;
  visit = session;
  const key = `${row.shortcode}:${row.sourceIndex}`;
  pending.delete(key);
  // Snapshot after diagnostic refinements; later changes replace only this photo.
  pending.set(key, JSON.parse(JSON.stringify(row)) as LoadOutcome);
  if (pending.size > 1000) pending.delete(pending.keys().next().value!);
  schedule();
}
export async function flushLocalLoadLog(keepalive = false) {
  if (sending || !pending.size || !enabled()) return;
  sending = true;
  const batch = [...pending.entries()].slice(0, keepalive ? 5 : 50);
  try {
    const response = await fetch(personalUrl("/api/personal/load-log"), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        visit,
        revision: import.meta.env.VITE_REPORT_BUILD ?? "unknown",
        rows: batch.map(([, row]) => row),
      }),
      signal: AbortSignal.timeout(5000),
      credentials: "omit",
      keepalive,
    });
    if (!response.ok) throw new Error("Local logging unavailable.");
    for (const [key, row] of batch)
      if (pending.get(key) === row) pending.delete(key);
    setStatus("Saved automatically to this PC's local load-logs folder.");
  } catch {
    setStatus(
      "Local log not saved yet. Check or restart the local server; retrying automatically.",
    );
  } finally {
    sending = false;
    if (pending.size && enabled())
      schedule(status.startsWith("Saved") ? 2000 : 30_000);
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void flushLocalLoadLog(true);
});
window.addEventListener("pagehide", () => {
  void flushLocalLoadLog(true);
});
