import { describe, expect, it } from "vitest";
import type { AppBackup, SavedPost } from "../db/schema";
import { sanitizePhotoOnlyBackup } from "../features/backup/sanitizeBackup";

describe("sanitizePhotoOnlyBackup", () => {
  it("keeps photo posts, removes unsupported media, and repairs collections", () => {
    const photo = createPhotoPost("ABC123");
    const unsupported = {
      ...createPhotoPost("DEF456"),
      id: "reel:DEF456",
      canonicalUrl: "https://www.instagram.com/reel/DEF456/",
      type: "reel",
    } as unknown as SavedPost;
    const backup: AppBackup = {
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      posts: [photo, unsupported],
      collections: [
        {
          id: "instagram_export:saved",
          name: "saved",
          source: "instagram_export",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          postIds: [photo.id, unsupported.id],
        },
      ],
      importJobs: [],
    };

    const sanitized = sanitizePhotoOnlyBackup(backup);

    expect(sanitized.posts).toEqual([photo]);
    expect(sanitized.collections[0].postIds).toEqual([photo.id]);
  });
});

function createPhotoPost(shortcode: string): SavedPost {
  const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;
  return {
    id: `post:${shortcode}`,
    url: canonicalUrl,
    canonicalUrl,
    shortcode,
    importedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    collectionNames: [],
    sourceFilePaths: ["test.json"],
    sourceFormat: "json",
    localTags: [],
    status: "unknown",
  };
}
