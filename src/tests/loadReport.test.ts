import { afterEach, expect, it, vi } from "vitest";
import {
  MediaLoadError,
  errorFailure,
  readLoadReport,
  recordImageFailure,
  recordLoadOutcome,
} from "../features/media/loadReport";
import type { MediaQueueItem } from "../features/media/mediaQueue";

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
  recordLoadOutcome(item, "failed", {
    status: 403,
    code: "restricted",
    stage: "metadata",
  });
  recordLoadOutcome(item, "failed", {
    status: 403,
    code: "restricted",
    stage: "metadata",
  });
  expect(readLoadReport()).toHaveLength(1);
  recordLoadOutcome(item, "loaded");
  expect(readLoadReport()).toEqual([
    expect.objectContaining({ outcome: "loaded", code: "loaded" }),
  ]);
});
it("retains only the most recent 1000 photos", () => {
  for (let index = 0; index < 1002; index++)
    recordLoadOutcome(
      { ...item, post: { ...item.post, shortcode: `Post${index}` } },
      "loaded",
    );
  expect(readLoadReport()).toHaveLength(1000);
  expect(readLoadReport()[0].shortcode).toBe("Post2");
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
  await recordImageFailure(item);
  expect(fetcher.mock.calls[0][0]).toBe("/api/personal/diagnostics/Example/0");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(readLoadReport()[0]).toMatchObject({
    outcome: "failed",
    code: "restricted",
    status: 403,
  });
});
it("keeps browser failures unknown and preserves typed metadata codes", async () => {
  vi.stubEnv("MODE", "production");
  await recordImageFailure(item);
  expect(readLoadReport()[0].code).toBe("image_load_error");
  expect(
    errorFailure(
      new MediaLoadError({
        status: 502,
        code: "graphql_error",
        stage: "metadata",
      }),
    ).code,
  ).toBe("graphql_error");
});
