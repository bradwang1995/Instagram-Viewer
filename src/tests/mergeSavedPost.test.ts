import { describe, expect, it } from "vitest";
import type { SavedPost } from "../db/schema";
import { mergeSavedPost } from "../features/import/mergeSavedPost";

const basePost: SavedPost = {
  id: "post:ABC123",
  url: "https://instagram.com/p/ABC123/",
  canonicalUrl: "https://www.instagram.com/p/ABC123/",
  shortcode: "ABC123",
  type: "post",
  importedAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  collectionNames: ["Recipes"],
  sourceFilePaths: ["old.json"],
  sourceFormat: "json",
  localNote: "Try this",
  localTags: ["food"],
  favorite: true,
  hidden: false,
  status: "embeddable",
};

describe("mergeSavedPost", () => {
  it("preserves local edits and merges import metadata", () => {
    const incoming: SavedPost = {
      ...basePost,
      importedAt: "2024-02-01T00:00:00.000Z",
      updatedAt: "2024-02-01T00:00:00.000Z",
      collectionNames: ["Dinner"],
      sourceFilePaths: ["new.json"],
      localNote: undefined,
      localTags: [],
      favorite: false,
      status: "unknown",
    };

    const merged = mergeSavedPost(basePost, incoming);

    expect(merged.localNote).toBe("Try this");
    expect(merged.localTags).toEqual(["food"]);
    expect(merged.favorite).toBe(true);
    expect(merged.status).toBe("embeddable");
    expect(merged.collectionNames).toEqual(["Recipes", "Dinner"]);
    expect(merged.sourceFilePaths).toEqual(["old.json", "new.json"]);
    expect(merged.importedAt).toBe("2024-01-01T00:00:00.000Z");
  });
});
