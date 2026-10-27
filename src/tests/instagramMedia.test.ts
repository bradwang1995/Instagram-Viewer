import { afterEach, describe, expect, it, vi } from "vitest";
import {
  firstPhotoPerPost,
  loadPostPhotos,
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
  it("discovers all seven entries from the explicit total, excludes videos, and caches metadata", async () => {
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
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(photos.map((entry) => entry.media.sourceIndex)).toEqual([
      0, 1, 2, 4, 5, 6,
    ]);
    expect(photos[5].media.assetUrl).toBe(
      "https://d.oginstagram.com/p/Seven/?img_index=7",
    );
    expect(await loadPostPhotos(item("Seven"), [])).toBe(photos);
    expect(fetcher).toHaveBeenCalledTimes(7);
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
});
