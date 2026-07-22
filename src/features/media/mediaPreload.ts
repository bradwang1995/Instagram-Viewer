import type { MediaQueueItem } from "./mediaQueue";

const MAX_RETAINED_IMAGES = 96;
const retainedImages = new Map<string, HTMLImageElement>();

export function preloadMediaItems(items: MediaQueueItem[]): void {
  if (typeof Image === "undefined") return;

  for (const item of items) {
    const url = item.media.assetUrl ?? item.media.previewUrl;
    if (!url) continue;

    const retained = retainedImages.get(url);
    if (retained) {
      retainedImages.delete(url);
      retainedImages.set(url, retained);
      continue;
    }

    const image = new Image();
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.src = url;
    retainedImages.set(url, image);
    void image.decode?.().catch(() => undefined);
  }

  while (retainedImages.size > MAX_RETAINED_IMAGES) {
    const oldestUrl = retainedImages.keys().next().value as string | undefined;
    if (!oldestUrl) break;
    retainedImages.delete(oldestUrl);
  }
}
