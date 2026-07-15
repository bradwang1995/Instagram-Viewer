import { describe, expect, it } from "vitest";
import { extractPostsFromHtml } from "../features/import/extractPostsFromHtml";

describe("extractPostsFromHtml", () => {
  it("extracts only photo-post URLs from HTML text", () => {
    const posts = extractPostsFromHtml(
      `<a href="https://www.instagram.com/p/ABC123/?utm_source=ig_web_copy_link">Photo</a>
       <a href="https://www.instagram.com/tv/GHI789/">Unsupported</a>`,
      {
        sourceFilePath: "saved.html",
        sourceFormat: "html",
      },
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: "post:ABC123",
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
      sourceFormat: "html",
    });
  });
});
