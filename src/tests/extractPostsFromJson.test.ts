import { describe, expect, it } from "vitest";
import { extractPostsFromJson } from "../features/import/extractPostsFromJson";

describe("extractPostsFromJson", () => {
  it("recursively extracts only saved photo-post URLs", () => {
    const posts = extractPostsFromJson(
      {
        saved_saved_media: [
          {
            string_map_data: {
              "Saved on": {
                timestamp: 1710000000,
              },
              Link: {
                href: "https://www.instagram.com/p/ABC123/?igsh=abc",
              },
            },
          },
          {
            nested: {
              value: "https://www.instagram.com/reel/DEF456/",
            },
          },
        ],
      },
      {
        sourceFilePath: "your_instagram_activity/saved/saved_saved_media.json",
        sourceFormat: "json",
      },
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: "post:ABC123",
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
      savedAt: "2024-03-09T16:00:00.000Z",
    });
  });

  it("handles the saved_posts.json array export shape", () => {
    const posts = extractPostsFromJson(
      [
        {
          timestamp: 1710000000,
          media: [],
          label_values: [
            {
              label: "URL",
              value: "https://www.instagram.com/p/ABC123/",
              href: "https://www.instagram.com/p/ABC123/?igsh=test",
            },
            {
              label: "Caption",
              value: "A real caption",
            },
            {
              title: "Owner",
              dict: [
                {
                  dict: [{ label: "Username", value: "example_owner" }],
                },
              ],
            },
          ],
          fbid: "example-fbid",
        },
      ],
      {
        sourceFilePath: "saved_posts.json",
        sourceFormat: "json",
      },
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
      savedAt: "2024-03-09T16:00:00.000Z",
      externalId: "example-fbid",
      embedAuthorName: "@example_owner",
      description: "A real caption",
    });
    expect(posts[0].collectionNames).not.toContain("URL");
  });
});
