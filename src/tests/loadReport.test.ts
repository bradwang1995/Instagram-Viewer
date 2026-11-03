import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MediaQueueItem } from "../features/media/mediaQueue";
let report: typeof import("../features/media/loadReport");
beforeEach(async () => {
  vi.resetModules();
  report = await import("../features/media/loadReport");
});
const item = {
  post: { id: "p", shortcode: "Example" },
  media: { sourceIndex: 0, sourceKind: "remote" },
} as MediaQueueItem;
afterEach(() => {
  report.flushLoadReport();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("keeps the latest result per photo and replaces failures after a successful later visit", () => {
  report.recordLoadOutcome(item, "failed", {
    status: 403,
    code: "restricted",
    stage: "metadata",
  });
  report.recordLoadOutcome(item, "failed", {
    status: 403,
    code: "restricted",
    stage: "metadata",
  });
  expect(report.readLoadReport()).toHaveLength(1);
  report.recordLoadOutcome(item, "loaded");
  expect(report.readLoadReport()).toEqual([
    expect.objectContaining({ outcome: "loaded", code: "loaded" }),
  ]);
});
it("retains only the most recent 1000 photos", () => {
  vi.useFakeTimers();
  const write = vi.spyOn(Storage.prototype, "setItem");
  for (let index = 0; index < 1002; index++)
    report.recordLoadOutcome(
      { ...item, post: { ...item.post, shortcode: `Post${index}` } },
      "loaded",
    );
  expect(report.readLoadReport()).toHaveLength(1000);
  expect(report.readLoadReport()[0].shortcode).toBe("Post2");
  expect(write).not.toHaveBeenCalled();
  vi.advanceTimersByTime(250);
  expect(write).toHaveBeenCalledTimes(1);
  expect(JSON.parse(write.mock.calls[0][1]).rows).toHaveLength(1000);
  write.mockRestore();
  vi.useRealTimers();
});
it("flushes pending rows on page hide and retains live results if storage is unavailable", () => {
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("storage denied");
    });
  report.recordLoadOutcome(item, "loaded");
  window.dispatchEvent(new Event("pagehide"));
  expect(write).toHaveBeenCalledTimes(1);
  report.recordLoadOutcome(item, "failed", { code: "timeout", stage: "image" });
  report.flushLoadReport();
  expect(report.readLoadReport()[0].code).toBe("timeout");
  expect(write).toHaveBeenCalledTimes(1);
  write.mockRestore();
});
it("reads local diagnostics without re-fetching media and preserves a restricted verdict", async () => {
  vi.stubEnv("MODE", "personal");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ status: 403, code: "restricted", stage: "metadata" }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await report.recordImageFailure(item);
  expect(fetcher.mock.calls[0][0]).toBe("/api/personal/diagnostics/Example/0");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(report.readLoadReport()[0]).toMatchObject({
    outcome: "failed",
    code: "restricted",
    status: 403,
  });
});
it("keeps browser failures unknown and preserves typed metadata codes", async () => {
  vi.stubEnv("MODE", "production");
  await report.recordImageFailure(item);
  expect(report.readLoadReport()[0].code).toBe("image_load_error");
  expect(
    report.errorFailure(
      new report.MediaLoadError({
        status: 502,
        code: "graphql_error",
        stage: "metadata",
      }),
    ).code,
  ).toBe("graphql_error");
});
it("does not let late diagnostics overwrite a newer successful image result", async () => {
  vi.stubEnv("MODE", "personal");
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = report.recordImageFailure(item);
  report.recordLoadOutcome(item, "loaded");
  finish(
    new Response(
      JSON.stringify({ status: 404, code: "not_found", stage: "image" }),
    ),
  );
  await pending;
  expect(report.readLoadReport()[0].outcome).toBe("loaded");
});
it("ignores previous visits and demo results, and identifies the actual source", () => {
  localStorage.setItem(
    "instagram-viewer:load-report:v1",
    JSON.stringify(Array(1000).fill({ outcome: "failed" })),
  );
  localStorage.setItem(
    "instagram-viewer:load-report:v2",
    JSON.stringify({ sessionId: "old visit", rows: [{ outcome: "failed" }] }),
  );
  expect(report.readLoadReport()).toEqual([]);
  report.recordLoadOutcome(
    { ...item, media: { ...item.media, sourceKind: "demo" } },
    "loaded",
  );
  expect(report.readLoadReport()).toEqual([]);
  report.recordLoadOutcome(item, "loaded");
  expect(report.readLoadReport()[0].source).toBe("default");
});
it("records an unrequested cooldown separately from a failed upstream request", () => {
  report.recordLoadOutcome(item, "failed", {
    code: "cooldown",
    status: 429,
    stage: "metadata",
    deferred: true,
  });
  expect(report.readLoadReport()[0].outcome).toBe("deferred");
});
