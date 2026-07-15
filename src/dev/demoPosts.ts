import type { SavedPost } from "../db/schema";

export function createDemoPosts(count = 45): SavedPost[] {
  return Array.from({ length: count }, (_, index) => {
    const position = index + 1;
    const shortcode = `DEMO${String(position).padStart(3, "0")}`;
    const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;
    const savedAt = new Date(Date.UTC(2026, 5, 30 - (index % 30), 12)).toISOString();

    return {
      id: `post:${shortcode}`,
      url: canonicalUrl,
      canonicalUrl,
      shortcode,
      savedAt,
      importedAt: savedAt,
      updatedAt: savedAt,
      collectionNames: ["Demo collection"],
      sourceFilePaths: ["demo-only.json"],
      sourceFormat: "json",
      localTags: [],
      status: "unknown",
    };
  });
}
