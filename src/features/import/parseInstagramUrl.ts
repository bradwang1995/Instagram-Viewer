import type { SavedPostType } from "../../db/schema";

export const IG_URL_REGEX =
  /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)\/?(?:\?[^"'<>\s]*)?/g;

const TYPE_SEGMENTS: Record<string, SavedPostType> = {
  p: "post",
  reel: "reel",
  tv: "tv",
};

export type ParsedInstagramUrl = {
  isValid: boolean;
  canonicalUrl?: string;
  shortcode?: string;
  type?: SavedPostType;
};

export function parseInstagramUrl(rawUrl: string): ParsedInstagramUrl {
  try {
    const sanitizedUrl = rawUrl
      .trim()
      .replace(/&amp;/g, "&")
      .replace(/[),.;\]]+$/g, "");
    const url = new URL(sanitizedUrl);

    if (!["instagram.com", "www.instagram.com"].includes(url.hostname)) {
      return { isValid: false };
    }

    const [typeSegment, shortcode] = url.pathname.split("/").filter(Boolean);
    const type = TYPE_SEGMENTS[typeSegment];

    if (!type || !shortcode) {
      return { isValid: false };
    }

    return {
      isValid: true,
      canonicalUrl: `https://www.instagram.com/${typeSegment}/${shortcode}/`,
      shortcode,
      type,
    };
  } catch {
    return { isValid: false };
  }
}

export function createPostId(type: SavedPostType, shortcode: string): string {
  return `${type}:${shortcode}`;
}

export function extractInstagramUrls(text: string): string[] {
  const matcher = new RegExp(IG_URL_REGEX.source, IG_URL_REGEX.flags);
  return Array.from(text.matchAll(matcher), (match) => match[0]);
}
