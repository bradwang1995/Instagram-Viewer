// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPersonalMedia, isInstagramCdn } from "./personal-media.mjs";
import { writeFile } from "node:fs/promises";

function sizedJpeg(width, height) {
  const bytes = Buffer.from([
    255, 216, 255, 192, 0, 17, 8, 0, 0, 0, 0, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
    255, 217,
  ]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes;
}

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
async function request(middleware, url, headers = {}, method = "GET") {
  let status, body, responseHeaders;
  await middleware(
    { url, method, headers: { host: "127.0.0.1:5178", ...headers } },
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
  it("serves a validated cached cover without fetching a manifest or the upstream image", async () => {
    const { middleware, fetcher, directory } = await setup();
    const bytes = sizedJpeg(1080, 1350);
    await writeFile(path.join(directory, "Example-0.image"), bytes);
    const cover = await request(
      middleware,
      "/api/personal/images/Example/0?quality=2&cover=1",
    );
    expect(cover.status).toBe(200);
    expect(cover.headers["X-Personal-Cache"]).toBe("HIT");
    expect(cover.body).toEqual(bytes);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("filters a low-resolution first photo and uses the next good image as the cover", async () => {
    const { middleware, fetcher, directory } = await setup();
    fetcher.mockImplementation(async (url) =>
      url.includes("/post/")
        ? new Response(
            JSON.stringify({
              complete: true,
              post: {
                Shortcode: "Example",
                Attachments: [
                  {
                    Kind: "image",
                    URL: "https://scontent.cdninstagram.com/low.jpg",
                    Width: 320,
                    Height: 341,
                  },
                  {
                    Kind: "image",
                    URL: "https://scontent.cdninstagram.com/high.jpg",
                    Width: 1080,
                    Height: 1350,
                  },
                ],
              },
            }),
          )
        : new Response(sizedJpeg(1080, 1350)),
    );
    const photos = JSON.parse(
      (await request(middleware, "/api/personal/posts/Example")).body,
    ).photos;
    expect(photos.map((p) => p.sourceIndex)).toEqual([1]);
    const cover = await request(
      middleware,
      "/api/personal/images/Example/0?quality=2&cover=1",
    );
    expect(cover.status).toBe(200);
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("low.jpg"))).toBe(
      false,
    );
    expect((await readdir(directory)).includes("Example-0.image")).toBe(false);
  });
  it("removes a low-resolution cache hit and refuses to persist a newly downloaded low-resolution image", async () => {
    const { middleware, fetcher, directory } = await setup();
    await writeFile(
      path.join(directory, "Example-0.image"),
      sizedJpeg(320, 341),
    );
    expect(
      (await request(middleware, "/api/personal/images/Example/0?quality=2"))
        .status,
    ).toBe(422);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockImplementation(async (url) =>
      url.includes("/post/")
        ? new Response(
            JSON.stringify({
              complete: true,
              post: {
                Shortcode: "Example",
                Attachments: [
                  {
                    Kind: "image",
                    URL: "https://scontent.cdninstagram.com/low.jpg",
                    Width: 1080,
                    Height: 1350,
                  },
                ],
              },
            }),
          )
        : new Response(sizedJpeg(320, 341)),
    );
    expect(
      (await request(middleware, "/api/personal/images/Example/0?quality=2"))
        .status,
    ).toBe(422);
    expect((await readdir(directory)).includes("Example-0.image")).toBe(false);
  });
  it("allows a preflight and explicit session handshake only for the production origin", async () => {
    const { middleware } = await setup();
    const remote = {
      origin: "https://bradwang1995.github.io",
      "sec-fetch-site": "cross-site",
    };
    const preflight = await request(
      middleware,
      "/api/personal/connect",
      remote,
      "OPTIONS",
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers["Access-Control-Allow-Origin"]).toBe(
      remote.origin,
    );
    expect(preflight.headers["Access-Control-Allow-Private-Network"]).toBe(
      "true",
    );
    expect(
      (await request(middleware, "/api/personal/posts/Example", remote)).status,
    ).toBe(401);
    expect(
      (await request(middleware, "/api/personal/connect", remote, "POST"))
        .status,
    ).toBe(403);
    const connected = await request(
      middleware,
      "/api/personal/connect",
      { ...remote, "x-viewer-connect": "1" },
      "POST",
    );
    const { session } = JSON.parse(connected.body);
    expect(session).toMatch(/^[a-f0-9]{64}$/);
    const photos = await request(
      middleware,
      "/api/personal/posts/Example?session=" + session,
      remote,
    );
    expect(photos.status).toBe(200);
    const image = await request(
      middleware,
      "/api/personal/images/Example/0?session=" + session,
      remote,
    );
    expect(image.status).toBe(200);
    expect(image.headers["Access-Control-Allow-Origin"]).toBe(remote.origin);
    expect(
      (
        await request(
          middleware,
          "/api/personal/images/Example/0?session=" + session,
          { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          middleware,
          "/api/personal/posts/Example?session=" + "é".repeat(64),
          remote,
        )
      ).status,
    ).toBe(401);
  });
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
  it("limits failed post retries while retaining the original failure reason", async () => {
    const { middleware, fetcher } = await setup();
    fetcher.mockResolvedValue(new Response("", { status: 502 }));
    expect(
      (await request(middleware, "/api/personal/posts/Example")).status,
    ).toBe(502);
    expect(
      (await request(middleware, "/api/personal/posts/Example")).status,
    ).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    [403, "restricted"],
    [404, "media_not_found"],
    [410, "not_found"],
    [429, "rate_limited"],
    [451, "geo_block_required"],
    [502, "graphql_error"],
  ])(
    "retains metadata diagnostics for HTTP %s without another upstream request",
    async (status, errorCode) => {
      const { middleware, fetcher } = await setup();
      fetcher.mockImplementation(
        async () => new Response(JSON.stringify({ errorCode }), { status }),
      );
      expect(
        (await request(middleware, "/api/personal/images/Example/0")).status,
      ).toBe(status);
      const diagnostic = await request(
        middleware,
        "/api/personal/diagnostics/Example/0",
      );
      expect(JSON.parse(diagnostic.body)).toEqual({
        status,
        code: errorCode,
        stage: "metadata",
      });
      expect(
        (await request(middleware, "/api/personal/images/Example/0")).status,
      ).toBe(status);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(
        (
          await request(middleware, "/api/personal/diagnostics/Example/0", {
            origin: "https://evil.example",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(middleware, "/api/personal/diagnostics/Example/0", {
            origin: "https://bradwang1995.github.io",
          })
        ).status,
      ).toBe(401);
    },
  );
  it("bounds disk usage instead of retaining every downloaded file", async () => {
    const { middleware, directory } = await setup({ maxBytes: 7, maxFiles: 1 });
    expect(
      (await request(middleware, "/api/personal/images/Example/0")).status,
    ).toBe(200);
    const files = await readdir(directory);
    expect(files).toEqual(["Example-0.image"]);
  });
  it("stops queued upstream work after rate limiting and labels unrequested photos as deferred", async () => {
    const { middleware, fetcher } = await setup();
    fetcher.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ errorCode: "rate_limited" }), {
        status: 429,
      });
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        request(middleware, `/api/personal/images/Limited${index}/0`),
      ),
    );
    expect(results.every((entry) => entry.status === 429)).toBe(true);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
    const deferred = results.filter(
      (entry) => JSON.parse(entry.body).deferred === true,
    );
    expect(deferred.length).toBeGreaterThanOrEqual(18);
    const diagnostic = await request(
      middleware,
      "/api/personal/diagnostics/Limited19/0",
    );
    expect(JSON.parse(diagnostic.body)).toMatchObject({
      status: 429,
      code: "cooldown",
      deferred: true,
    });
  });
});
