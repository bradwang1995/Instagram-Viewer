import { describe, expect, it } from "vitest";
import { extractResolvedMediaManifest } from "../features/import/extractResolvedMediaManifest";

const context = {
  sourceFilePath: "resolved-media.json",
  sourceFormat: "json" as const,
};

describe("extractResolvedMediaManifest", () => {
  it("extracts stable, ordered photo identities from a V1 manifest", () => {
    const result = extractResolvedMediaManifest(
      manifest([
        {
          id: "cover",
          assetUrl: "https://cdn.example.com/cover.jpg",
          previewUrl: "data:image/webp;base64,UklGRg==",
          caption: "Cover frame",
          width: 1080,
          height: 1350,
        },
        {
          id: "detail-2",
          assetUrl: "data:image/jpeg;base64,/9j/2Q==",
        },
      ]),
      context,
    );

    expect(result.matched).toBe(true);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]).toMatchObject({
      id: "post:CAROUSEL1",
      embedAuthorName: "@example",
      title: "A carousel",
      collectionNames: ["Saved", "Ideas"],
    });
    expect(result.mediaItems).toMatchObject([
      {
        id: "post:CAROUSEL1:media:resolved:cover",
        sourceMediaId: "cover",
        sourceIndex: 0,
        sourceKind: "remote",
        caption: "Cover frame",
        width: 1080,
        height: 1350,
      },
      {
        id: "post:CAROUSEL1:media:resolved:detail-2",
        sourceMediaId: "detail-2",
        sourceIndex: 1,
        sourceKind: "local",
      },
    ]);
  });

  it("does not claim ordinary Instagram export JSON", () => {
    expect(
      extractResolvedMediaManifest({ saved_saved_media: [] }, context),
    ).toEqual({ matched: false, posts: [], mediaItems: [] });
  });

  it("rejects duplicate posts and duplicate media identities", () => {
    const duplicatePost = manifest([{ id: "one", assetUrl: safeUrl("one") }]);
    duplicatePost.posts.push(duplicatePost.posts[0]);
    expect(() => extractResolvedMediaManifest(duplicatePost, context)).toThrow(
      /duplicates source post/,
    );

    expect(() =>
      extractResolvedMediaManifest(
        manifest([
          { id: "same", assetUrl: safeUrl("one") },
          { id: "same", assetUrl: safeUrl("two") },
        ]),
        context,
      ),
    ).toThrow(/duplicates same/);
  });

  it.each([
    "file:///private/photo.jpg",
    "http://example.com/photo.jpg",
    "https://127.0.0.1/photo.jpg",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/png;base64,not-valid-padding=",
  ])("rejects unsafe media URL %s", (assetUrl) => {
    expect(() =>
      extractResolvedMediaManifest(
        manifest([{ id: "unsafe", assetUrl }]),
        context,
      ),
    ).toThrow(/public HTTPS URL or a safe base64 image/);
  });

  it("rejects invalid versions, IDs, and partial dimensions", () => {
    expect(() =>
      extractResolvedMediaManifest(
        { ...manifest([{ id: "one", assetUrl: safeUrl("one") }]), version: 2 },
        context,
      ),
    ).toThrow(/version must be 1/);
    expect(() =>
      extractResolvedMediaManifest(
        manifest([{ id: "not allowed!", assetUrl: safeUrl("one") }]),
        context,
      ),
    ).toThrow(/must use 1-128/);
    expect(() =>
      extractResolvedMediaManifest(
        manifest([{ id: "one", assetUrl: safeUrl("one"), width: 1080 }]),
        context,
      ),
    ).toThrow(/width and .*height/);
  });
});

function manifest(media: Array<Record<string, unknown>>) {
  return {
    format: "instagram-viewer.resolved-media",
    version: 1,
    posts: [
      {
        postUrl: "https://www.instagram.com/p/CAROUSEL1/",
        creatorHandle: "example",
        title: "A carousel",
        savedAt: "2026-07-01T12:00:00.000Z",
        collectionNames: ["Saved", "Ideas", "Saved"],
        media,
      },
    ],
  };
}

function safeUrl(name: string) {
  return `https://cdn.example.com/${name}.jpg`;
}
