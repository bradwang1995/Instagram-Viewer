export const IG_URL_REGEX =
  /https?:\/\/(?:www\.)?instagram\.com\/p\/([A-Za-z0-9_-]+)\/?(?:\?[^"'<>\s]*)?/g;

export type ParsedInstagramUrl = {
  isValid: boolean;
  canonicalUrl?: string;
  shortcode?: string;
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

    const [pathSegment, shortcode] = url.pathname.split("/").filter(Boolean);

    if (pathSegment !== "p" || !shortcode) {
      return { isValid: false };
    }

    return {
      isValid: true,
      canonicalUrl: `https://www.instagram.com/p/${shortcode}/`,
      shortcode,
    };
  } catch {
    return { isValid: false };
  }
}

export function createPostId(shortcode: string): string {
  return `post:${shortcode}`;
}

export function extractInstagramUrls(text: string): string[] {
  const matcher = new RegExp(IG_URL_REGEX.source, IG_URL_REGEX.flags);
  return Array.from(text.matchAll(matcher), (match) => match[0]);
}
