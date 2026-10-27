import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

let cache;
const context = { waitUntil: (promise) => promise };
const request = (path, options = {}) =>
  new Request(`https://metadata.test${path}`, options);
beforeEach(() => {
  cache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal("caches", { default: cache });
});
afterEach(() => vi.unstubAllGlobals());
describe("production metadata gateway", () => {
  it("rejects arbitrary destinations, extra parameters, and other origins", async () => {
    for (const path of [
      "/https://example.com/",
      "/p/Code/?img_index=51",
      "/p/Code/?img_index=1&url=https://example.com",
    ]) {
      expect((await worker.fetch(request(path), {}, context)).status).toBe(400);
    }
    expect(
      (
        await worker.fetch(
          request("/p/Code/?img_index=1", {
            headers: { Origin: "https://other.test" },
          }),
          {},
          context,
        )
      ).status,
    ).toBe(403);
  });
  it("handles production CORS preflight without contacting upstream", async () => {
    const response = await worker.fetch(
      request("/p/Code/?img_index=1", {
        method: "OPTIONS",
        headers: { Origin: "https://bradwang1995.github.io" },
      }),
      {},
      context,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://bradwang1995.github.io",
    );
  });
  it("streams and caches only successful ActivityPub responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('{"type":"Note"}', {
        headers: { "Content-Type": "application/activity+json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(
      request("/p/Code/?img_index=1"),
      {},
      context,
    );
    expect(await response.text()).toBe('{"type":"Note"}');
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://oginstagram.com/p/Code/?img_index=1",
    );
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
    expect(cache.put).toHaveBeenCalledOnce();
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
  it("preserves rate limits without caching or retrying failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("limited", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const response = await worker.fetch(
      request("/p/Code/?img_index=1"),
      {},
      context,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(cache.put).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
