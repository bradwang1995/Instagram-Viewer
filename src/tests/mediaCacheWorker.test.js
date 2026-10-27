import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

function setup() {
  const events = {};
  const cache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  };
  const caches = {
    keys: vi
      .fn()
      .mockResolvedValue([
        "instagram-viewer-media-v1",
        "instagram-viewer-media-v2",
      ]),
    delete: vi.fn(),
    open: vi.fn().mockResolvedValue(cache),
  };
  const fetcher = vi.fn();
  vm.runInNewContext(readFileSync("public/media-cache-sw.js", "utf8"), {
    URL,
    caches,
    fetch: fetcher,
    self: {
      location: { origin: "https://viewer.test" },
      addEventListener: (name, listener) => (events[name] = listener),
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
    },
  });
  return { events, caches, cache, fetcher };
}
describe("image service worker cache", () => {
  it("removes the old opaque cache on activation", async () => {
    const { events, caches } = setup();
    let activation;
    events.activate({ waitUntil: (promise) => (activation = promise) });
    await activation;
    expect(caches.delete).toHaveBeenCalledWith("instagram-viewer-media-v1");
    expect(caches.delete).not.toHaveBeenCalledWith("instagram-viewer-media-v2");
  });
  it("does not intercept cross-origin images or persist their hidden failures", () => {
    const { events, fetcher } = setup();
    const respondWith = vi.fn();
    events.fetch({
      request: {
        method: "GET",
        destination: "image",
        url: "https://d.oginstagram.com/p/Code/?img_index=1",
      },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns successful images even if disk cache storage is full", async () => {
    const { events, cache, fetcher } = setup();
    cache.put.mockRejectedValue(new Error("quota"));
    fetcher.mockResolvedValue(
      new Response("image", { headers: { "Content-Type": "image/jpeg" } }),
    );
    let result;
    events.fetch({
      request: {
        method: "GET",
        destination: "image",
        url: "https://viewer.test/demo/image.jpg",
      },
      respondWith: (promise) => (result = promise),
    });
    expect(await (await result).text()).toBe("image");
  });
});
