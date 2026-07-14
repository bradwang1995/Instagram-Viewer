import type { SavedPost } from "../../db/schema";

export function getInstagramEmbedUrl(post: SavedPost): string {
  const canonicalUrl = post.canonicalUrl.endsWith("/")
    ? post.canonicalUrl
    : `${post.canonicalUrl}/`;

  return `${canonicalUrl}embed/`;
}
