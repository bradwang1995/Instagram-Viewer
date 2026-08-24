import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaQueueItem } from "../features/media/mediaQueue";

class MockImage {
  static instances: MockImage[] = [];

  decoding = "";
  referrerPolicy = "";
  src = "";
  decode = vi.fn().mockResolvedValue(undefined);

  constructor() {
    MockImage.instances.push(this);
  }
}

describe("media preload cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    MockImage.instances = [];
  });

  it("retains a 24-image LRU decode window and refreshes reused entries", async () => {
    vi.stubGlobal("Image", MockImage as unknown as typeof Image);
    const { preloadMediaItems } =
      await import("../features/media/mediaPreload");
    const firstWindow = Array.from({ length: 24 }, (_, index) =>
      createItem(`https://images.example/${index}.webp`),
    );

    preloadMediaItems(firstWindow);
    expect(MockImage.instances).toHaveLength(24);
    expect(
      MockImage.instances.every(
        (image) => image.decode.mock.calls.length === 1,
      ),
    ).toBe(true);

    preloadMediaItems([firstWindow[0]]);
    expect(MockImage.instances).toHaveLength(24);

    preloadMediaItems([createItem("https://images.example/24.webp")]);
    expect(MockImage.instances).toHaveLength(25);

    preloadMediaItems([firstWindow[1]]);
    expect(MockImage.instances).toHaveLength(26);

    preloadMediaItems([firstWindow[0]]);
    expect(MockImage.instances).toHaveLength(26);
  });

  it("prefers the asset URL and configures every preload for async decoding", async () => {
    vi.stubGlobal("Image", MockImage as unknown as typeof Image);
    const { preloadMediaItems } =
      await import("../features/media/mediaPreload");

    preloadMediaItems([
      createItem(
        "https://images.example/asset.webp",
        "https://images.example/preview.webp",
      ),
    ]);

    expect(MockImage.instances).toHaveLength(1);
    expect(MockImage.instances[0]).toMatchObject({
      decoding: "async",
      referrerPolicy: "no-referrer",
      src: "https://images.example/asset.webp",
    });
    expect(MockImage.instances[0].decode).toHaveBeenCalledOnce();
  });
});

function createItem(assetUrl: string, previewUrl?: string): MediaQueueItem {
  return {
    media: { assetUrl, previewUrl },
  } as MediaQueueItem;
}
