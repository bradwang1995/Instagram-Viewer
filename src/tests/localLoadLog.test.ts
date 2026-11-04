import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LoadOutcome } from "../features/media/loadReport";
let log: typeof import("../features/media/localLoadLog");
const row = {
  shortcode: "Example",
  sourceIndex: 0,
  source: "local",
  outcome: "loaded",
  code: "loaded",
  stage: "image",
  time: "2026-11-03T23:00:00Z",
  observations: 1,
  history: [],
} as LoadOutcome;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("MODE", "personal");
  log = await import("../features/media/localLoadLog");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});
it("automatically batches local results and replaces a photo after diagnostics arrive", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  log.queueLocalLoadLog(row, "2026-11-03T23:00:00.000Z:0.123");
  log.queueLocalLoadLog(
    { ...row, diagnostics: { imageCache: "hit" } },
    "2026-11-03T23:00:00.000Z:0.123",
  );
  expect(fetcher).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/personal/load-log");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).rows).toEqual([
    expect.objectContaining({ diagnostics: { imageCache: "hit" } }),
  ]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("retains failed batches and retries without changing image loading", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  log.queueLocalLoadLog(row, "2026-11-03T23:00:00.000Z:0.123");
  await vi.advanceTimersByTimeAsync(2000);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not transmit default-service results or run without a local connection", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  log.queueLocalLoadLog({ ...row, source: "default" }, "visit");
  vi.stubEnv("MODE", "production");
  log.queueLocalLoadLog(row, "visit");
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetcher).not.toHaveBeenCalled();
});
