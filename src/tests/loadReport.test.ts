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
  for (let index = 0; index < 1002; index++)
    report.recordLoadOutcome(
      { ...item, post: { ...item.post, shortcode: `Post${index}` } },
      "loaded",
    );
  expect(report.readLoadReport()).toHaveLength(1000);
  expect(report.readLoadReport()[0].shortcode).toBe("Post2");
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
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(new Response("{}")),
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
it("ignores demo results and identifies the actual source", () => {
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

it("retains bounded outcome history and the first failure through cooldown and recovery", () => {
  report.recordLoadOutcome(item, "failed", {
    code: "graphql_error",
    stage: "metadata",
    status: 502,
    diagnostics: { upstreamRequests: 1 },
  });
  report.recordLoadOutcome(item, "failed", {
    code: "graphql_error",
    stage: "metadata",
    deferred: true,
    diagnostics: { upstreamRequests: 0, metadataCache: "cooldown" },
  });
  for (let i = 0; i < 9; i++) report.recordLoadOutcome(item, "loaded");
  const row = report.readLoadReport()[0];
  expect(row.observations).toBe(11);
  expect(row.history).toHaveLength(8);
  expect(row.firstFailure).toMatchObject({
    code: "graphql_error",
    status: 502,
  });
});

it("allows only non-sensitive validated gateway diagnostics", async () => {
  const result = await report.responseFailure(
    new Response(
      JSON.stringify({
        errorCode: "graphql_error",
        diagnostics: {
          metadataCache: "miss",
          metadataMs: 34,
          queueMs: -1,
          imageMs: "secret",
          upstreamRequests: 1,
          url: "https://example.com/?session=secret",
          session: "secret",
          body: "private response",
          service: {
            diagnostics: 1,
            revision: "abcdef1",
            startedAt: "2026-11-03T23:00:00Z",
            token: "secret",
          },
        },
      }),
      { status: 502 },
    ),
    "metadata",
  );
  expect(result.diagnostics).toEqual({
    metadataCache: "miss",
    metadataMs: 34,
    upstreamRequests: 1,
    service: {
      diagnostics: 1,
      revision: "abcdef1",
      startedAt: "2026-11-03T23:00:00Z",
    },
  });
  expect(JSON.stringify(result)).not.toContain("secret");
});

it("enriches successful photos without fetching the image again", async () => {
  vi.stubEnv("MODE", "personal");
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        status: 200,
        code: "loaded",
        recordedAt: "2026-11-03T23:00:00Z",
        diagnostics: { imageCache: "hit", upstreamRequests: 0, imageMs: 0 },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  report.recordLoadOutcome(item, "loaded");
  await vi.waitFor(() =>
    expect(report.readLoadReport()[0].diagnostics?.imageCache).toBe("hit"),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/personal/diagnostics/Example/0");
  expect(report.readLoadReport()[0].observations).toBe(1);
});
