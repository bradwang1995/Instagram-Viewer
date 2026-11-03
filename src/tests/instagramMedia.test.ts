import { afterEach, describe, expect, it, vi } from "vitest";
import {
  firstPhotoPerPost,
  loadPostPhotos,
  resolveMediaUrl,
} from "../features/media/instagramMedia";
import type { MediaQueueItem } from "../features/media/mediaQueue";

function item(code: string, index = 0): MediaQueueItem {
  return {
    post: {
      id: code,
      shortcode: code,
      url: `https://www.instagram.com/p/${code}/`,
      canonicalUrl: `https://www.instagram.com/p/${code}/`,
      importedAt: "2026-01-01",
      updatedAt: "2026-01-01",
      collectionNames: [],
      sourceFilePaths: [],
      sourceFormat: "json",
      localTags: [],
      status: "unknown",
    },
    media: {
      id: `${code}:${index}`,
      sourcePostId: code,
      sourceIndex: index,
      sourceKind: "embed",
      type: "image",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("post photo source", () => {
  it("keeps the first photo per post even if the source queue is out of order", () => {
    expect(
      firstPhotoPerPost([item("A", 2), item("B"), item("A")]).map(
        (entry) => entry.media.id,
      ),
    ).toEqual(["A:0", "B:0"]);
  });
  it("discovers the count immediately, resolves only requested cards, and caches shared metadata", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const index = Number(
        new URL(url, "https://local.test").searchParams.get("img_index"),
      );
      return new Response(
        JSON.stringify({
          type: "Note",
          id: `https://oginstagram.com/p/Seven/${index}`,
          content: `<p><b>🖼️ ${index} / 7  ❤️ 42</b></p>`,
          attachment: [
            {
              mediaType: index === 4 ? "video/mp4" : "image/jpeg",
              url: "https://scontent.cdninstagram.com/photo-" + index + ".jpg",
              width: 800,
              height: 1000,
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const [photos, concurrent] = await Promise.all([
      loadPostPhotos(item("Seven"), []),
      loadPostPhotos(item("Seven"), []),
    ]);
    expect(concurrent).toBe(photos);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(photos.map((entry) => entry.media.sourceIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(photos[6].media.assetUrl).toBeUndefined();
    expect(await resolveMediaUrl(photos[6])).toBe(
      "https://scontent.cdninstagram.com/photo-7.jpg",
    );
    expect(await loadPostPhotos(item("Seven"), [])).toBe(photos);
    await expect(resolveMediaUrl(photos[3])).rejects.toThrow("unavailable");
    expect(await resolveMediaUrl(photos[1])).toContain("photo-2.jpg");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("rejects clamped or unexpected responses instead of duplicating photos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: "Note",
            id: "https://oginstagram.com/p/Wrong/2",
            content: "",
            attachment: [{ mediaType: "image/jpeg" }],
          }),
        ),
      ),
    );
    await expect(loadPostPhotos(item("Wrong"), [])).rejects.toThrow(
      "requested photo list",
    );
  });
  it("does not treat caption numbers as a total and does not cache failures", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            type: "Note",
            id: "https://oginstagram.com/p/Single/1",
            content: "<p>🖼️ 1 / 20 in my caption</p>",
            attachment: [{ mediaType: "image/jpeg" }],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(loadPostPhotos(item("Single"), [])).rejects.toThrow("offline");
    expect(await loadPostPhotos(item("Single"), [])).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects known low-quality covers before downloading and preserves good carousel source indexes", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const index = Number(
        new URL(url, "https://local.test").searchParams.get("img_index"),
      );
      return new Response(
        JSON.stringify({
          type: "Note",
          id: `https://oginstagram.com/p/QualityAudit/${index}`,
          content: `<p><b>🖼️ ${index} / 3  ❤️ 42</b></p>`,
          attachment: [
            {
              mediaType: "image/jpeg",
              url: `https://scontent.cdninstagram.com/quality-${index}.jpg`,
              width: index === 1 ? 320 : 1080,
              height: index === 1 ? 341 : 1350,
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(resolveMediaUrl(item("QualityAudit"))).rejects.toMatchObject({
      failure: { status: 422, code: "low_resolution", stage: "image" },
    });
    const photos = await loadPostPhotos(item("QualityAudit"), []);
    expect(photos.map((photo) => photo.media.sourceIndex)).toEqual([1, 2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await Promise.all(photos.map((photo) => resolveMediaUrl(photo)));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([url]) => url.includes("resolve=1"))).toBe(
      true,
    );
  });
  it("keeps the 640-pixel boundary and reports an all-low-quality post accurately", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const code = url.includes("BoundaryAudit")
        ? "BoundaryAudit"
        : "AllLowAudit";
      return new Response(
        JSON.stringify({
          type: "Note",
          id: `https://oginstagram.com/p/${code}/1`,
          content: "",
          attachment: [
            {
              mediaType: "image/jpeg",
              url: "https://scontent.cdninstagram.com/boundary.jpg",
              width: code === "BoundaryAudit" ? 640 : 639,
              height: 400,
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await resolveMediaUrl(item("BoundaryAudit"))).toContain(
      "boundary.jpg",
    );
    await expect(loadPostPhotos(item("AllLowAudit"), [])).rejects.toMatchObject(
      {
        failure: { status: 422, code: "low_resolution", stage: "image" },
      },
    );
  });
  it("does not misclassify a video-only post as a low-resolution photo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: "Note",
            id: "https://oginstagram.com/p/VideoOnlyAudit/1",
            content: "",
            attachment: [{ mediaType: "video/mp4", width: 320, height: 400 }],
          }),
        ),
      ),
    );
    await expect(loadPostPhotos(item("VideoOnlyAudit"), [])).rejects.toThrow(
      "No photos are available",
    );
  });
  it("stops queued metadata traffic during a rate-limit cooldown", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("limited", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        loadPostPhotos(item("Limited" + index), []),
      ),
    );
    expect(result.every((entry) => entry.status === "rejected")).toBe(true);
    expect(
      result.filter(
        (entry) =>
          entry.status === "rejected" &&
          entry.reason.failure?.deferred === true,
      ).length,
    ).toBeGreaterThanOrEqual(10);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
    await expect(loadPostPhotos(item("LimitedLater"), [])).rejects.toThrow(
      "wait a minute",
    );
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
