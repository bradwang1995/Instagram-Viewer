const allowedOrigin = "https://bradwang1995.github.io";

export default {
  async fetch(
    request: Request,
    _env: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const headers = new Headers({
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    });
    const reply = (status: number, message: string) =>
      new Response(status === 204 ? null : message, { status, headers });
    if (origin && origin !== allowedOrigin)
      return reply(403, "Origin not allowed");
    if (request.method === "OPTIONS") return reply(204, "");
    if (request.method !== "GET") return reply(405, "Method not allowed");
    if (url.pathname === "/health") return reply(200, "ok");
    // A fixed upstream and strict route prevent this service becoming an open proxy.
    if (
      !/^\/p\/[A-Za-z0-9_-]{1,24}\/$/.test(url.pathname) ||
      [...url.searchParams].length !== 1 ||
      !/^(?:[1-9]|[1-4][0-9]|50)$/.test(url.searchParams.get("img_index") ?? "")
    ) {
      return reply(400, "Invalid photo request");
    }
    const cacheKey = new Request(url.toString());
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    try {
      const upstream = await fetch(
        `https://oginstagram.com${url.pathname}${url.search}`,
        {
          headers: { Accept: "application/activity+json" },
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!upstream.ok) {
        headers.set("Cache-Control", "no-store");
        if (upstream.status === 429)
          headers.set(
            "Retry-After",
            upstream.headers.get("Retry-After") || "60",
          );
        await upstream.body?.cancel();
        return reply(
          upstream.status >= 300 && upstream.status < 400
            ? 502
            : upstream.status,
          "Media source temporarily unavailable",
        );
      }
      const contentType = upstream.headers.get("Content-Type") || "";
      if (!contentType.includes("application/activity+json")) {
        await upstream.body?.cancel();
        return reply(502, "Unexpected media source response");
      }
      headers.set("Content-Type", contentType);
      headers.set("Cache-Control", "public, max-age=300");
      const response = new Response(upstream.body, { headers });
      ctx.waitUntil(
        caches.default.put(cacheKey, response.clone()).catch(() => undefined),
      );
      return response;
    } catch (error) {
      console.error(
        "metadata_upstream_failed",
        error instanceof Error ? error.message : "unknown",
      );
      return reply(502, "Media source request failed");
    }
  },
};
