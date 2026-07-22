import type { MediaItem, SavedPost } from "../../db/schema";
import type { ExtractContext } from "./importTypes";
import { createSavedPostFromUrl } from "./importTypes";

const MANIFEST_FORMAT = "instagram-viewer.resolved-media";
const MANIFEST_VERSION = 1;
const SAFE_MEDIA_ID = /^[a-z0-9._~-]{1,128}$/i;
const SAFE_DATA_IMAGE =
  /^data:image\/(?:avif|gif|jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i;
const VALID_BASE64 =
  /^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/i;
const MAX_REMOTE_URL_LENGTH = 4_096;
const MAX_DATA_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_DATA_IMAGE_BYTES = 100 * 1024 * 1024;

export type ResolvedMediaManifestResult = {
  matched: boolean;
  posts: SavedPost[];
  mediaItems: MediaItem[];
};

export function extractResolvedMediaManifest(
  json: unknown,
  context: ExtractContext,
): ResolvedMediaManifestResult {
  const root = asRecord(json);
  if (!root || root.format !== MANIFEST_FORMAT) {
    return { matched: false, posts: [], mediaItems: [] };
  }
  if (root.version !== MANIFEST_VERSION) {
    throw new Error(`Resolved media manifest version must be ${MANIFEST_VERSION}.`);
  }
  if (!Array.isArray(root.posts) || root.posts.length === 0) {
    throw new Error("Resolved media manifest posts must contain at least one post.");
  }

  const importedAt = new Date().toISOString();
  const posts: SavedPost[] = [];
  const mediaItems: MediaItem[] = [];
  const seenPostIds = new Set<string>();
  let totalDataImageBytes = 0;

  root.posts.forEach((entry, postIndex) => {
    const path = `posts[${postIndex}]`;
    const source = requireRecord(entry, path);
    const postUrl = requireString(source.postUrl, `${path}.postUrl`);
    const post = createSavedPostFromUrl(postUrl, context, {
      savedAt: optionalDate(source.savedAt, `${path}.savedAt`),
      collectionNames: optionalStringArray(
        source.collectionNames,
        `${path}.collectionNames`,
      ),
      importedAt,
    });
    if (!post) {
      throw new Error(`${path}.postUrl must be an Instagram /p/ URL.`);
    }
    if (seenPostIds.has(post.id)) {
      throw new Error(`${path} duplicates source post ${post.shortcode}.`);
    }
    seenPostIds.add(post.id);

    const creator = optionalString(source.creatorHandle, `${path}.creatorHandle`);
    const enrichedPost: SavedPost = {
      ...post,
      title: optionalString(source.title, `${path}.title`),
      description: optionalString(source.description, `${path}.description`),
      embedAuthorName: creator ? normalizeCreatorHandle(creator) : undefined,
    };

    if (!Array.isArray(source.media) || source.media.length === 0) {
      throw new Error(`${path}.media must contain at least one photo.`);
    }
    const seenMediaIds = new Set<string>();

    source.media.forEach((mediaEntry, sourceIndex) => {
      const mediaPath = `${path}.media[${sourceIndex}]`;
      const media = requireRecord(mediaEntry, mediaPath);
      if (media.type !== undefined && media.type !== "image") {
        throw new Error(`${mediaPath}.type must be "image" when provided.`);
      }
      const sourceMediaId = requireString(media.id, `${mediaPath}.id`);
      if (!SAFE_MEDIA_ID.test(sourceMediaId)) {
        throw new Error(
          `${mediaPath}.id must use 1-128 letters, numbers, dots, underscores, tildes, or hyphens.`,
        );
      }
      if (seenMediaIds.has(sourceMediaId)) {
        throw new Error(`${mediaPath}.id duplicates ${sourceMediaId}.`);
      }
      seenMediaIds.add(sourceMediaId);

      const assetUrl = requireMediaUrl(media.assetUrl, `${mediaPath}.assetUrl`);
      const previewUrl = optionalMediaUrl(
        media.previewUrl,
        `${mediaPath}.previewUrl`,
      );
      totalDataImageBytes += dataImageByteLength(assetUrl);
      totalDataImageBytes += dataImageByteLength(previewUrl);
      if (totalDataImageBytes > MAX_TOTAL_DATA_IMAGE_BYTES) {
        throw new Error("Resolved media manifest contains more than 100 MiB of data images.");
      }

      const width = optionalPositiveInteger(media.width, `${mediaPath}.width`);
      const height = optionalPositiveInteger(media.height, `${mediaPath}.height`);
      if ((width === undefined) !== (height === undefined)) {
        throw new Error(
          `${mediaPath}.width and ${mediaPath}.height must be provided together.`,
        );
      }

      mediaItems.push({
        id: `${post.id}:media:resolved:${sourceMediaId}`,
        sourcePostId: post.id,
        sourceMediaId,
        sourceIndex,
        type: "image",
        sourceKind: assetUrl.startsWith("data:image/") ? "local" : "remote",
        creatorHandle: enrichedPost.embedAuthorName,
        caption:
          optionalString(media.caption, `${mediaPath}.caption`) ??
          enrichedPost.description ??
          enrichedPost.title,
        previewUrl,
        assetUrl,
        width,
        height,
        createdAt: importedAt,
        updatedAt: importedAt,
      });
    });

    posts.push(enrichedPost);
  });

  return { matched: true, posts, mediaItems };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw new Error(`${path} must be an object.`);
  return record;
}

function requireString(value: unknown, path: string): string {
  const result = optionalString(value, path);
  if (!result) throw new Error(`${path} must be a non-empty string.`);
  return result;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty string when provided.`);
  }
  return value.trim();
}

function optionalStringArray(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return Array.from(
    new Set(value.map((entry, index) => requireString(entry, `${path}[${index}]`))),
  );
}

function optionalDate(value: unknown, path: string): string | undefined {
  const raw = optionalString(value, path);
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${path} must be a valid date.`);
  }
  return date.toISOString();
}

function requireMediaUrl(value: unknown, path: string): string {
  const raw = requireString(value, path);
  const dataBytes = dataImageByteLength(raw);
  if (dataBytes > 0) {
    if (dataBytes > MAX_DATA_IMAGE_BYTES) {
      throw new Error(`${path} data image must not exceed 10 MiB.`);
    }
    return raw;
  }

  try {
    const url = new URL(raw);
    if (
      raw.length <= MAX_REMOTE_URL_LENGTH &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !isPrivateNetworkHost(url.hostname)
    ) {
      return raw;
    }
  } catch {
    // The shared validation error below is more useful than a URL parser error.
  }
  throw new Error(
    `${path} must be a public HTTPS URL or a safe base64 image data URL.`,
  );
}

function optionalMediaUrl(value: unknown, path: string): string | undefined {
  const raw = optionalString(value, path);
  return raw ? requireMediaUrl(raw, path) : undefined;
}

function dataImageByteLength(value: string | undefined): number {
  if (!value) return 0;
  const match = SAFE_DATA_IMAGE.exec(value);
  if (!match) return 0;
  const base64 = match[1].replace(/\s/g, "");
  if (!base64 || !VALID_BASE64.test(base64)) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(1, Math.floor((base64.length * 3) / 4) - padding);
}

function isPrivateNetworkHost(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/g, "");
  const isIpv6 = host.includes(":");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    (isIpv6 &&
      (host.startsWith("fc") ||
        host.startsWith("fd") ||
        host.startsWith("fe80:")))
  ) {
    return true;
  }
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function optionalPositiveInteger(
  value: unknown,
  path: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive integer when provided.`);
  }
  return value;
}

function normalizeCreatorHandle(value: string): string {
  return value.startsWith("@") ? value : `@${value}`;
}
