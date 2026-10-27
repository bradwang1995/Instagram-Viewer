import type { MediaQueueItem } from "./mediaQueue";

const mediaOrigin =
  import.meta.env.VITE_INSTAGRAM_MEDIA_ORIGIN || "https://d.oginstagram.com";
const metadataOrigin =
  import.meta.env.VITE_INSTAGRAM_METADATA_ORIGIN || "/api/instagram";
const cache = new Map<string, { expires: number; items: MediaQueueItem[] }>();
const pending = new Map<string, Promise<MediaQueueItem[]>>();

export function getMediaUrl(item: MediaQueueItem): string | undefined {
  if (item.media.assetUrl || item.media.previewUrl) {
    return item.media.assetUrl ?? item.media.previewUrl;
  }
  const shortcode = item.post.shortcode;
  if (!shortcode || !/^[\w-]{1,24}$/.test(shortcode)) return undefined;
  return `${mediaOrigin}/p/${shortcode}/?img_index=${item.media.sourceIndex + 1}`;
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

type Attachment = { mediaType: string; width?: number; height?: number };
type Note = {
  id: string;
  type: string;
  content: string;
  attachment: Attachment[];
};

async function readPhoto(shortcode: string, index: number): Promise<Note> {
  const response = await fetch(
    `${metadataOrigin}/p/${shortcode}/?img_index=${index}`,
    {
      headers: { Accept: "application/activity+json" },
      signal: AbortSignal.timeout(20_000),
    },
  );
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
          assetUrl: `${mediaOrigin}/p/${shortcode}/?img_index=${offset + 1}`,
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
