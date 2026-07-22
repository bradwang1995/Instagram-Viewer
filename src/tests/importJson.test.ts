import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import { clearLocalDatabase } from "../db/postRepository";
import { importSavedPostsJsonFile } from "../features/import/importJson";
import { buildMediaQueue } from "../features/media/mediaQueue";

describe("importSavedPostsJsonFile", () => {
  beforeEach(() => clearLocalDatabase());

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it("imports every carousel photo as an independent queue item", async () => {
    const job = await importSavedPostsJsonFile(
      jsonFile("resolved-media.json", {
        format: "instagram-viewer.resolved-media",
        version: 1,
        posts: [
          {
            postUrl: "https://www.instagram.com/p/THREEPHOTOS/",
            creatorHandle: "gallery",
            media: ["first", "second", "third"].map((id) => ({
              id,
              assetUrl: `https://cdn.example.com/${id}.jpg`,
            })),
          },
        ],
      }),
    );

    expect(job).toMatchObject({
      status: "completed",
      totalUniquePostsFound: 1,
      totalNewPostsAdded: 1,
    });
    const posts = await db.posts.toArray();
    const items = await db.mediaItems.toArray();
    expect(buildMediaQueue(posts, items, []).map(({ media }) => media.sourceMediaId)).toEqual(
      ["first", "second", "third"],
    );
  });

  it("keeps ordinary saved_posts JSON on the existing fallback path", async () => {
    const job = await importSavedPostsJsonFile(
      jsonFile("saved_posts.json", [
        {
          label_values: [
            {
              label: "URL",
              href: "https://www.instagram.com/p/LEGACY1/",
            },
          ],
        },
      ]),
    );

    expect(job.status).toBe("completed");
    expect(await db.posts.count()).toBe(1);
    expect(await db.mediaItems.toArray()).toMatchObject([
      { sourcePostId: "post:LEGACY1", sourceKind: "embed" },
    ]);
  });

  it("fails an unsafe manifest without partially changing posts or media", async () => {
    const job = await importSavedPostsJsonFile(
      jsonFile("unsafe.json", {
        format: "instagram-viewer.resolved-media",
        version: 1,
        posts: [
          {
            postUrl: "https://www.instagram.com/p/UNSAFE1/",
            media: [{ id: "one", assetUrl: "file:///private/photo.jpg" }],
          },
        ],
      }),
    );

    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/public HTTPS URL or a safe base64 image/);
    expect(await db.posts.count()).toBe(0);
    expect(await db.mediaItems.count()).toBe(0);
  });
});

function jsonFile(name: string, value: unknown): File {
  const text = JSON.stringify(value);
  return {
    name,
    size: new TextEncoder().encode(text).byteLength,
    text: async () => text,
  } as File;
}
