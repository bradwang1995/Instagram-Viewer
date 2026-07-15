import { describe, expect, it } from "vitest";
import type { SavedPost } from "../db/schema";
import { EMPTY_FILTERS, filterPosts } from "../features/library/postFilters";

const posts: SavedPost[] = [
  createPost("one", "2026-01-01T12:00:00.000Z"),
  createPost("two", "2026-01-15T12:00:00.000Z"),
  createPost("three", "2026-02-01T12:00:00.000Z"),
];

describe("filterPosts date range", () => {
  it("includes both boundary dates", () => {
    const result = filterPosts(posts, {
      ...EMPTY_FILTERS,
      dateFrom: "2026-01-01",
      dateTo: "2026-01-15",
      includeHidden: true,
    });

    expect(result.map((post) => post.shortcode)).toEqual(["one", "two"]);
  });
});

function createPost(shortcode: string, savedAt: string): SavedPost {
  const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;
  return {
    id: `post:${shortcode}`,
    url: canonicalUrl,
    canonicalUrl,
    shortcode,
    savedAt,
    importedAt: savedAt,
    updatedAt: savedAt,
    collectionNames: [],
    sourceFilePaths: ["test.json"],
    sourceFormat: "json",
    localTags: [],
    status: "unknown",
  };
}
