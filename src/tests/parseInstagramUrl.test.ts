import { describe, expect, it } from "vitest";
import { createPostId, parseInstagramUrl } from "../features/import/parseInstagramUrl";

describe("parseInstagramUrl", () => {
  it("canonicalizes supported Instagram post URLs", () => {
    expect(parseInstagramUrl("https://instagram.com/p/ABC123/?igsh=abc")).toMatchObject({
      isValid: true,
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
      shortcode: "ABC123",
      type: "post",
    });
  });

  it("supports reels and tv URLs", () => {
    expect(parseInstagramUrl("https://www.instagram.com/reel/DEF456/")).toMatchObject({
      type: "reel",
      shortcode: "DEF456",
    });
    expect(parseInstagramUrl("https://www.instagram.com/tv/GHI789/")).toMatchObject({
      type: "tv",
      shortcode: "GHI789",
    });
  });

  it("rejects unsupported URLs", () => {
    expect(parseInstagramUrl("https://www.instagram.com/explore/tags/design/")).toEqual({
      isValid: false,
    });
    expect(parseInstagramUrl("https://example.com/p/ABC123/")).toEqual({
      isValid: false,
    });
  });

  it("creates deterministic post ids", () => {
    expect(createPostId("reel", "DEF456")).toBe("reel:DEF456");
  });
});
