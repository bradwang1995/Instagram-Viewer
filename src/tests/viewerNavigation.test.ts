import { describe, expect, it } from "vitest";
import { getInstagramEmbedUrl } from "../features/embed/instagramEmbedUrl";
import { getAdjacentItemId } from "../features/slideshow/navigation";
import type { SavedPost } from "../db/schema";

describe("viewer navigation", () => {
  it("moves in both directions and wraps", () => {
    const ids = ["one", "two", "three"];

    expect(getAdjacentItemId(ids, "one", 1)).toBe("two");
    expect(getAdjacentItemId(ids, "three", 1)).toBe("one");
    expect(getAdjacentItemId(ids, "one", -1)).toBe("three");
  });

  it("builds the supported Instagram iframe URL", () => {
    expect(getInstagramEmbedUrl(createPost("ABC123"))).toBe(
      "https://www.instagram.com/p/ABC123/embed/",
    );
  });
});

function createPost(shortcode: string): SavedPost {
  const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;
  return {
    id: `post:${shortcode}`,
    url: canonicalUrl,
    canonicalUrl,
    shortcode,
    type: "post",
    importedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    collectionNames: [],
    sourceFilePaths: ["test.json"],
    sourceFormat: "json",
    localTags: [],
    status: "unknown",
  };
}
