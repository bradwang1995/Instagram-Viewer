import { describe, expect, it } from "vitest";
import { extractPostsFromHtml } from "../features/import/extractPostsFromHtml";

describe("extractPostsFromHtml", () => {
  it("extracts Instagram URLs from HTML text", () => {
    const posts = extractPostsFromHtml(
      `<a href="https://www.instagram.com/tv/GHI789/?utm_source=ig_web_copy_link">Saved</a>`,
      {
        sourceFilePath: "saved.html",
        sourceFormat: "html",
      },
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: "tv:GHI789",
      canonicalUrl: "https://www.instagram.com/tv/GHI789/",
      sourceFormat: "html",
    });
  });
});
