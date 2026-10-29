import { afterEach, expect, it, vi } from "vitest";
import type { MediaQueueItem } from "../features/media/mediaQueue";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
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
it("enables loopback URLs only in this browser and carries the session without trusting remote URLs", async () => {
  vi.stubEnv("MODE", "production");
  const module = await import("../features/media/personalMedia");
  expect(module.mediaSource(item)).toBe(item.media.assetUrl);
  const token = "a".repeat(64);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ session: token }))),
  );
  expect(await module.connectLocalService()).toBe(true);
  module.setLocalService(true);
  expect(module.mediaSource(item)).toBe(
    "http://127.0.0.1:5178/api/personal/images/Example/0?session=" + token,
  );
  expect(localStorage.getItem(module.LOCAL_SERVICE_KEY)).toBe("enabled");
  module.setLocalService(false);
  expect(module.mediaSource(item)).toBe(item.media.assetUrl);
  expect(sessionStorage.length).toBe(0);
});
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
