// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPersonalMedia, isInstagramCdn } from "./personal-media.mjs";

const dirs = [];
afterEach(async () => {
  await Promise.all(
    dirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function setup(options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "personal-media-"));
  dirs.push(directory);
  const fetcher = vi.fn(async (url) =>
    url.startsWith("http://127.0.0.1:18081/post/")
      ? new Response(
          JSON.stringify({
            complete: true,
            post: {
              Shortcode: "Example",
              Attachments: [
                {
                  Kind: "image",
                  URL: "https://scontent.cdninstagram.com/one.jpg",
                  Width: 800,
                  Height: 1000,
                },
                {
                  Kind: "video",
                  URL: "https://scontent.cdninstagram.com/two.mp4",
                },
                {
                  Kind: "image",
                  URL: "https://scontent.cdninstagram.com/three.jpg",
                },
              ],
            },
          }),
        )
      : new Response(new Uint8Array([255, 216, 255, 0, 1, 2]), {
          headers: { "Content-Type": "image/jpeg" },
        }),
  );
  const middleware = createPersonalMedia({ directory, fetcher, ...options });
  return { directory, fetcher, middleware };
}
async function request(middleware, url, headers = {}) {
  let status, body, responseHeaders;
  await middleware(
    { url, method: "GET", headers: { host: "127.0.0.1:5178", ...headers } },
    {
      writeHead(s, h) {
        status = s;
        responseHeaders = h;
      },
      end(b) {
        body = b;
      },
    },
    () => {
      throw Error("unexpected next");
    },
  );
  return { status, body, headers: responseHeaders };
}
describe("personal disk media gateway", () => {
  it("deduplicates a complete post and preserves original indices while excluding videos", async () => {
    const { middleware, fetcher } = await setup();
    const responses = await Promise.all([
      request(middleware, "/api/personal/posts/Example"),
      request(middleware, "/api/personal/posts/Example"),
    ]);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(
      JSON.parse(responses[0].body).photos.map((p) => p.sourceIndex),
    ).toEqual([0, 2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("serves image bytes across gateway restart without any upstream requests", async () => {
    const { middleware, fetcher, directory } = await setup();
    expect(
      (await request(middleware, "/api/personal/images/Example/0")).headers[
        "X-Personal-Cache"
      ],
    ).toBe("MISS");
    const offline = vi.fn(() => {
      throw Error("offline");
    });
    const restarted = createPersonalMedia({ directory, fetcher: offline });
    const result = await request(restarted, "/api/personal/images/Example/0");
    expect(result.status).toBe(200);
    expect(result.headers["X-Personal-Cache"]).toBe("HIT");
    expect(offline).not.toHaveBeenCalled();
    expect(
      (await request(restarted, "/api/personal/posts/Example")).status,
    ).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects cross-site requests and arbitrary proxy destinations", async () => {
    const { middleware, fetcher } = await setup();
    expect(
      (
        await request(middleware, "/api/personal/posts/Example", {
          "sec-fetch-site": "cross-site",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(middleware, "/api/personal/posts/Example", {
          origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          middleware,
          "/api/personal/images/Example/0?url=https://evil.example",
        )
      ).status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(isInstagramCdn("https://cdninstagram.com.evil.example/a")).toBe(
      false,
    );
    expect(isInstagramCdn("https://user:pass@cdninstagram.com/a")).toBe(false);
  });
  it("never persists an HTML error as an image", async () => {
    const { middleware, fetcher, directory } = await setup();
    fetcher.mockImplementation(async (url) =>
      url.includes("/post/")
        ? new Response(
            JSON.stringify({
              complete: true,
              post: {
                Shortcode: "Example",
                Attachments: [
                  { Kind: "image", URL: "https://scontent.cdninstagram.com/a" },
                ],
              },
            }),
          )
        : new Response("<html>blocked</html>"),
    );
    expect(
      (await request(middleware, "/api/personal/images/Example/0")).status,
    ).toBe(502);
    expect(
      (await readdir(directory)).some((name) => name.endsWith(".image")),
    ).toBe(false);
  });
  it("refreshes an expired CDN link once and stores the replacement image", async () => {
    const { middleware, fetcher } = await setup();
    let metadata = 0;
    fetcher.mockImplementation(async (url) => {
      if (url.includes("/post/")) {
        metadata++;
        return new Response(
          JSON.stringify({
            complete: true,
            post: {
              Shortcode: "Example",
              Attachments: [
                {
                  Kind: "image",
                  URL: `https://scontent.cdninstagram.com/${metadata}.jpg`,
                },
              ],
            },
          }),
        );
      }
      return url.endsWith("/1.jpg")
        ? new Response("", { status: 403 })
        : new Response(new Uint8Array([255, 216, 255, 1]));
    });
    expect(
      (await request(middleware, "/api/personal/images/Example/0")).status,
    ).toBe(200);
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("?refresh=1"))).toBe(
      true,
    );
    expect(metadata).toBe(2);
  });
  it("limits failed post retries without permanently caching unavailability", async () => {
    const { middleware, fetcher } = await setup();
    fetcher.mockResolvedValue(new Response("", { status: 502 }));
    expect(
      (await request(middleware, "/api/personal/posts/Example")).status,
    ).toBe(502);
    expect(
      (await request(middleware, "/api/personal/posts/Example")).status,
    ).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds disk usage instead of retaining every downloaded file", async () => {
    const { middleware, directory } = await setup({ maxBytes: 7, maxFiles: 1 });
    expect(
      (await request(middleware, "/api/personal/images/Example/0")).status,
    ).toBe(200);
    const files = await readdir(directory);
    expect(files).toEqual(["Example-0.image"]);
  });
});
