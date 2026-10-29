import { afterEach, expect, it, vi } from "vitest";
import type { MediaQueueItem } from "../features/media/mediaQueue";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
const item = {
  post: { id: "Post", shortcode: "Example" },
  media: {
    id: "cover",
    sourceIndex: 0,
    sourceKind: "remote",
    assetUrl: "https://expired.example/old.jpg",
  },
} as MediaQueueItem;
it("routes personal covers through stable local image URLs and leaves demo sources intact", async () => {
  vi.stubEnv("MODE", "personal");
  const { mediaSource } = await import("../features/media/personalMedia");
  expect(mediaSource(item)).toBe("/api/personal/images/Example/0");
  expect(
    mediaSource({ ...item, media: { ...item.media, sourceKind: "demo" } }),
  ).toBe(item.media.assetUrl);
});
it("uses one local manifest call for a carousel and preserves video gaps", async () => {
  vi.stubEnv("MODE", "personal");
  vi.resetModules();
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        photos: [
          { sourceIndex: 0, url: "/api/personal/images/Example/0" },
          { sourceIndex: 2, url: "/api/personal/images/Example/2" },
        ],
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const { loadPostPhotos } = await import("../features/media/instagramMedia");
  const photos = await loadPostPhotos(item, []);
  expect(photos.map((photo) => photo.media.sourceIndex)).toEqual([0, 2]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
