import type { SavedPost } from "../../db/schema";
import type { ExtractContext } from "./importTypes";
import { createSavedPostFromUrl } from "./importTypes";
import { extractInstagramUrls } from "./parseInstagramUrl";

export function extractPostsFromHtml(
  html: string,
  context: ExtractContext,
): SavedPost[] {
  const text = decodeHtmlEntities(html);
  const rawUrls = extractInstagramUrls(text);

  return rawUrls
    .map((rawUrl) => createSavedPostFromUrl(rawUrl, context))
    .filter((post): post is SavedPost => Boolean(post));
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
