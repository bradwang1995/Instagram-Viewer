import type { MediaQueueItem } from "./mediaQueue";
import { createRequestQueue } from "./requestQueue";
import { createSharedRequests } from "./sharedRequests.mjs";
import { mediaSource, usesPersonalMedia, personalUrl } from "./personalMedia";
import { MediaLoadError, responseFailure } from "./loadReport";

const metadataOrigin =
  import.meta.env.VITE_INSTAGRAM_METADATA_ORIGIN ||
  (import.meta.env.DEV
    ? "/api/instagram"
    : "https://instagram-viewer-metadata.bradwang1995.workers.dev");
const cache = new Map<string, { expires: number; items: MediaQueueItem[] }>();
const requestPost = createSharedRequests<MediaQueueItem[]>();
const requestMetadata = createRequestQueue(2);
const notes = new Map<string, { expires: number; note: Note }>();
const requestNote = createSharedRequests<Note>();
let blockedUntil = 0;

export class MediaRateLimitError extends MediaLoadError {
  constructor(deferred = false) {
    super({
      status: 429,
      code: deferred ? "cooldown" : "rate_limited",
      stage: "metadata",
      ...(deferred ? { deferred: true } : {}),
    });
    this.message =
      "The media service is busy. Please wait a minute before retrying.";
  }
}

export async function resolveMediaUrl(
  item: MediaQueueItem,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const direct = mediaSource(item);
  if (direct) return direct;
  if (!item.post.shortcode) throw new Error("No photo source available.");
  const note = await readPhoto(
    item.post.shortcode,
    item.media.sourceIndex + 1,
    signal,
  );
  const url = note.attachment[0]?.url;
  if (!url || !note.attachment[0]?.mediaType.startsWith("image/"))
    throw new Error("This photo is unavailable.");
  if (isLowResolution(note.attachment[0])) throw lowResolutionError();
  return url;
}

export function firstPhotoPerPost(queue: MediaQueueItem[]): MediaQueueItem[] {
  const first = new Map<string, MediaQueueItem>();
  for (const item of queue) {
    const current = first.get(item.post.id);
    if (!current || item.media.sourceIndex < current.media.sourceIndex) {
      first.set(item.post.id, item);
    }
  }
  return [...first.values()];
}

type Attachment = {
  mediaType: string;
  url?: string;
  width?: number;
  height?: number;
};
type Note = {
  id: string;
  type: string;
  content: string;
  attachment: Attachment[];
};

function isLowResolution(attachment: Attachment): boolean {
  return (
    typeof attachment.width === "number" &&
    typeof attachment.height === "number" &&
    attachment.width > 0 &&
    attachment.height > 0 &&
    Math.max(attachment.width, attachment.height) < 640
  );
}

function lowResolutionError() {
  return new MediaLoadError({
    status: 422,
    code: "low_resolution",
    stage: "image",
  });
}

async function readPhoto(
  shortcode: string,
  index: number,
  signal?: AbortSignal,
): Promise<Note> {
  signal?.throwIfAborted();
  const key = `${shortcode}:${index}`;
  const cached = notes.get(key);
  if (cached && cached.expires > Date.now()) return cached.note;
  return requestNote(
    key,
    (sharedSignal) =>
      requestMetadata(async () => {
        if (Date.now() < blockedUntil) throw new MediaRateLimitError(true);
        const note = await fetchPhoto(shortcode, index, sharedSignal);
        sharedSignal.throwIfAborted();
        notes.set(key, { expires: Date.now() + 300_000, note });
        if (notes.size > 300) notes.delete(notes.keys().next().value!);
        return note;
      }, sharedSignal),
    signal,
  );
}

async function fetchPhoto(
  shortcode: string,
  index: number,
  signal: AbortSignal,
): Promise<Note> {
  const response = await fetch(
    `${metadataOrigin}/p/${shortcode}/?img_index=${index}&resolve=1`,
    {
      headers: { Accept: "application/activity+json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    },
  );
  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After"));
    blockedUntil =
      Date.now() + Math.max(60, Math.min(3600, seconds || 60)) * 1000;
    throw new MediaRateLimitError();
  }
  if (!response.ok)
    throw new MediaLoadError(await responseFailure(response, "metadata"));
  const note = (await response.json()) as Note;
  if (
    note.type !== "Note" ||
    !Array.isArray(note.attachment) ||
    note.attachment.length !== 1 ||
    typeof note.id !== "string" ||
    typeof note.content !== "string" ||
    !new URL(note.id).pathname.endsWith(`/p/${shortcode}/${index}`)
  ) {
    throw new Error(
      "The media service did not return the requested photo list.",
    );
  }
  return note;
}

export async function loadPostPhotos(
  item: MediaQueueItem,
  knownItems: MediaQueueItem[],
  signal?: AbortSignal,
): Promise<MediaQueueItem[]> {
  signal?.throwIfAborted();
  const local = knownItems.filter(
    (entry) => entry.post.id === item.post.id && entry.media.type === "image",
  );
  if (
    item.media.sourceKind === "demo" ||
    item.media.sourceKind === "local" ||
    (local.length > 1 && !usesPersonalMedia(item))
  ) {
    return [...local].sort((a, b) => a.media.sourceIndex - b.media.sourceIndex);
  }
  const shortcode = item.post.shortcode;
  if (!shortcode || !/^[\w-]{1,24}$/.test(shortcode))
    throw new Error("This post has no valid Instagram shortcode.");
  const key = `${usesPersonalMedia(item) ? "local" : "default"}:${item.post.id}:${shortcode}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.items;
  return requestPost(
    key,
    async (sharedSignal) => {
      const items = await fetchPostPhotos(item, shortcode, sharedSignal);
      sharedSignal.throwIfAborted();
      cache.set(key, { expires: Date.now() + 600_000, items });
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
      return items;
    },
    signal,
  );
}

async function fetchPostPhotos(
  item: MediaQueueItem,
  shortcode: string,
  signal: AbortSignal,
): Promise<MediaQueueItem[]> {
  if (usesPersonalMedia(item)) {
    const response = await fetch(
      personalUrl(`/api/personal/posts/${encodeURIComponent(shortcode)}`),
      { signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]) },
    );
    if (response.status === 429) throw new MediaRateLimitError();
    if (!response.ok)
      throw new MediaLoadError(await responseFailure(response, "metadata"));
    const data = await response.json();
    if (
      !Array.isArray(data.photos) ||
      !data.photos.length ||
      data.photos.length > 50 ||
      data.photos.some(
        (photo: { sourceIndex: number; url: string }) =>
          !Number.isInteger(photo.sourceIndex) ||
          photo.sourceIndex < 0 ||
          photo.sourceIndex > 49 ||
          photo.url !==
            `/api/personal/images/${shortcode}/${photo.sourceIndex}?quality=2`,
      )
    )
      throw new Error("Invalid local photo list.");
    const items: MediaQueueItem[] = data.photos.map(
      (photo: {
        sourceIndex: number;
        url: string;
        width?: number;
        height?: number;
      }) => ({
        post: item.post,
        media: {
          ...item.media,
          id: `${item.post.id}:photo:${photo.sourceIndex}`,
          sourceIndex: photo.sourceIndex,
          type: "image",
          sourceKind: "remote",
          assetUrl: personalUrl(photo.url),
          previewUrl: undefined,
          width: photo.width,
          height: photo.height,
        },
      }),
    );
    return items;
  }
  const first = await readPhoto(shortcode, 1, signal);
  // Only read the service's leading stats paragraph, never numbers in the caption.
  const indicator = first.content.match(/^<p><b>🖼️\s+1\s*\/\s*(\d+)\b/u);
  const total = indicator ? Number(indicator[1]) : 1;
  if (total < 1 || total > 50)
    throw new Error("The media service returned an invalid photo count.");
  // Discover the count once; each card resolves its metadata only inside the lazy window.
  const items = Array.from({ length: total }, (_, offset) => offset).flatMap(
    (offset): MediaQueueItem[] => {
      const attachment = offset === 0 ? first.attachment[0] : undefined;
      if (
        attachment &&
        (!attachment.mediaType?.startsWith("image/") ||
          isLowResolution(attachment))
      )
        return [];
      return [
        {
          post: item.post,
          media: {
            ...item.media,
            id: `${item.post.id}:photo:${offset}`,
            sourceIndex: offset,
            type: "image",
            sourceKind: attachment ? "remote" : "embed",
            assetUrl: attachment?.url,
            previewUrl: undefined,
            width: attachment?.width,
            height: attachment?.height,
          },
        },
      ];
    },
  );
  if (!items.length) {
    if (
      first.attachment.some(
        (attachment) =>
          attachment.mediaType?.startsWith("image/") &&
          isLowResolution(attachment),
      )
    )
      throw lowResolutionError();
    throw new Error("No photos are available in this post.");
  }
  return items;
}
