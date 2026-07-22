import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/db";
import { setMediaVisibility } from "../db/mediaRepository";
import {
  bulkUpsertImportedPosts,
  clearLocalDatabase,
} from "../db/postRepository";
import type { MediaItem, SavedPost } from "../db/schema";

describe("bulkUpsertImportedPosts resolved media", () => {
  beforeEach(() => clearLocalDatabase());

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("atomically replaces fallback media, preserves unrelated posts, and is idempotent", async () => {
    const source = post("CAROUSEL1");
    const unrelated = post("OTHER1");
    await bulkUpsertImportedPosts([source, unrelated]);
    expect(await db.mediaItems.count()).toBe(2);

    const cover = media(source, "cover", 0);
    const detail = media(source, "detail", 1);
    await bulkUpsertImportedPosts([source], [cover, detail]);

    expect(
      (await db.mediaItems.where("sourcePostId").equals(source.id).toArray()).map(
        (item) => item.id,
      ),
    ).toEqual([cover.id, detail.id]);
    expect(
      await db.mediaItems.where("sourcePostId").equals(unrelated.id).count(),
    ).toBe(1);

    await setMediaVisibility(cover.id, "hidden");
    await bulkUpsertImportedPosts(
      [source],
      [{ ...cover, sourceIndex: 1 }, { ...detail, sourceIndex: 0 }],
    );
    expect(await db.mediaItems.where("sourcePostId").equals(source.id).count()).toBe(
      2,
    );
    expect(await db.mediaPreferences.get(cover.id)).toMatchObject({
      visibility: "hidden",
    });

    await bulkUpsertImportedPosts([source], [{ ...cover, sourceIndex: 0 }]);
    expect(
      (await db.mediaItems.where("sourcePostId").equals(source.id).toArray()).map(
        (item) => item.id,
      ),
    ).toEqual([cover.id]);

    await bulkUpsertImportedPosts([source]);
    expect(
      (await db.mediaItems.where("sourcePostId").equals(source.id).toArray()).map(
        (item) => item.id,
      ),
    ).toEqual([cover.id]);
  });

  it("rolls post and media changes back together when media persistence fails", async () => {
    const source = post("ROLLBACK1");
    const bulkPut = vi
      .spyOn(db.mediaItems, "bulkPut")
      .mockRejectedValueOnce(new Error("simulated media failure"));

    await expect(
      bulkUpsertImportedPosts([source], [media(source, "cover", 0)]),
    ).rejects.toThrow("simulated media failure");
    bulkPut.mockRestore();

    expect(await db.posts.get(source.id)).toBeUndefined();
    expect(await db.mediaItems.where("sourcePostId").equals(source.id).count()).toBe(
      0,
    );
  });
});

function post(shortcode: string): SavedPost {
  const timestamp = "2026-07-15T00:00:00.000Z";
  const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;
  return {
    id: `post:${shortcode}`,
    url: canonicalUrl,
    canonicalUrl,
    shortcode,
    importedAt: timestamp,
    updatedAt: timestamp,
    collectionNames: [],
    sourceFilePaths: ["test.json"],
    sourceFormat: "json",
    localTags: [],
    status: "unknown",
  };
}

function media(
  source: SavedPost,
  sourceMediaId: string,
  sourceIndex: number,
): MediaItem {
  const timestamp = "2026-07-15T00:00:00.000Z";
  return {
    id: `${source.id}:media:resolved:${sourceMediaId}`,
    sourcePostId: source.id,
    sourceMediaId,
    sourceIndex,
    type: "image",
    sourceKind: "remote",
    assetUrl: `https://cdn.example.com/${sourceMediaId}.jpg`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
