import type { MediaQueueItem } from "./mediaQueue";
import { createRequestQueue } from "./requestQueue";

const metadataOrigin =
  import.meta.env.VITE_INSTAGRAM_METADATA_ORIGIN ||
  (import.meta.env.DEV
    ? "/api/instagram"
    : "https://instagram-viewer-metadata.bradwang1995.workers.dev");
const cache = new Map<string, { expires: number; items: MediaQueueItem[] }>();
const pending = new Map<string, Promise<MediaQueueItem[]>>();
const requestMetadata = createRequestQueue(2);
const notes = new Map<string, { expires: number; note: Note }>();
const pendingNotes = new Map<string, Promise<Note>>();
let blockedUntil = 0;

export class MediaRateLimitError extends Error {
  constructor() {
    super("The media service is busy. Please wait a minute before retrying.");
  }
}

export async function resolveMediaUrl(item: MediaQueueItem): Promise<string> {
  const direct = item.media.assetUrl ?? item.media.previewUrl;
  if (direct) return direct;
  if (!item.post.shortcode) throw new Error("No photo source available.");
  const note = await readPhoto(item.post.shortcode, item.media.sourceIndex + 1);
  const url = note.attachment[0]?.url;
  if (!url || !note.attachment[0]?.mediaType.startsWith("image/"))
    throw new Error("This photo is unavailable.");
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

async function readPhoto(shortcode: string, index: number): Promise<Note> {
  const key = `${shortcode}:${index}`;
  const cached = notes.get(key);
  if (cached && cached.expires > Date.now()) return cached.note;
  const inFlight = pendingNotes.get(key);
  if (inFlight) return inFlight;
  const task = requestMetadata(async () => {
    if (Date.now() < blockedUntil) throw new MediaRateLimitError();
    const note = await fetchPhoto(shortcode, index);
    notes.set(key, { expires: Date.now() + 300_000, note });
    if (notes.size > 300) notes.delete(notes.keys().next().value!);
    return note;
  });
  pendingNotes.set(key, task);
  try {
    return await task;
  } finally {
    pendingNotes.delete(key);
  }
}

async function fetchPhoto(shortcode: string, index: number): Promise<Note> {
  const response = await fetch(
    `${metadataOrigin}/p/${shortcode}/?img_index=${index}&resolve=1`,
    {
      headers: { Accept: "application/activity+json" },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After"));
    blockedUntil =
      Date.now() + Math.max(60, Math.min(3600, seconds || 60)) * 1000;
    throw new MediaRateLimitError();
  }
  if (!response.ok)
    throw new Error(`Photo list request failed (${response.status}).`);
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
): Promise<MediaQueueItem[]> {
  const local = knownItems.filter(
    (entry) => entry.post.id === item.post.id && entry.media.type === "image",
  );
  if (
    item.media.sourceKind === "demo" ||
    item.media.sourceKind === "local" ||
    local.length > 1
  ) {
    return [...local].sort((a, b) => a.media.sourceIndex - b.media.sourceIndex);
  }
  const shortcode = item.post.shortcode;
  if (!shortcode || !/^[\w-]{1,24}$/.test(shortcode))
    throw new Error("This post has no valid Instagram shortcode.");
  const cached = cache.get(shortcode);
  if (cached && cached.expires > Date.now()) return cached.items;
  const inFlight = pending.get(shortcode);
  if (inFlight) return inFlight;
  const request = fetchPostPhotos(item, shortcode);
  pending.set(shortcode, request);
  try {
    return await request;
  } finally {
    pending.delete(shortcode);
  }
}

async function fetchPostPhotos(
  item: MediaQueueItem,
  shortcode: string,
): Promise<MediaQueueItem[]> {
  const first = await readPhoto(shortcode, 1);
  // Only read the service's leading stats paragraph, never numbers in the caption.
  const indicator = first.content.match(/^<p><b>🖼️\s+1\s*\/\s*(\d+)\b/u);
  const total = indicator ? Number(indicator[1]) : 1;
  if (total < 1 || total > 50)
    throw new Error("The media service returned an invalid photo count.");
  const notes = [first];
  // Keep metadata traffic bounded; do not probe beyond the reported count.
  for (let start = 2; start <= total; start += 3) {
    notes.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(3, total - start + 1) }, (_, offset) =>
          readPhoto(shortcode, start + offset),
        ),
      )),
    );
  }
  const items = notes.flatMap((note, offset): MediaQueueItem[] => {
    const attachment = note.attachment[0];
    if (!attachment || !attachment.mediaType?.startsWith("image/")) return [];
    return [
      {
        post: item.post,
        media: {
          ...item.media,
          id: `${item.post.id}:photo:${offset}`,
          sourceIndex: offset,
          type: "image",
          sourceKind: "remote",
          assetUrl: attachment.url,
          previewUrl: undefined,
          width: attachment.width,
          height: attachment.height,
        },
      },
    ];
  });
  if (!items.length) throw new Error("No photos are available in this post.");
  cache.delete(shortcode);
  cache.set(shortcode, { expires: Date.now() + 10 * 60_000, items });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return items;
}
