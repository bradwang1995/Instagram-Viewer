import type { MediaQueueItem } from "./mediaQueue";

export function usesPersonalMedia(item: MediaQueueItem): boolean {
  return (
    import.meta.env.MODE === "personal" &&
    Boolean(item.post.shortcode) &&
    item.media.sourceKind !== "demo" &&
    item.media.sourceKind !== "local"
  );
}

export function mediaSource(item: MediaQueueItem): string | undefined {
  if (usesPersonalMedia(item)) {
    return `/api/personal/images/${encodeURIComponent(item.post.shortcode!)}/${item.media.sourceIndex}`;
  }
  return item.media.assetUrl ?? item.media.previewUrl;
}
