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
      "Cache-Control": "no-store",
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
      [...url.searchParams].length !==
        (url.searchParams.has("resolve") ? 2 : 1) ||
      (url.searchParams.has("resolve") &&
        url.searchParams.get("resolve") !== "1") ||
      !/^(?:[1-9]|[1-4][0-9]|50)$/.test(url.searchParams.get("img_index") ?? "")
    ) {
      return reply(400, "Invalid photo request");
    }
    const cacheKey = new Request(url.toString());
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    try {
      const upstream = await fetch(
        `https://oginstagram.com${url.pathname}?img_index=${url.searchParams.get("img_index")}`,
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
      let body: BodyInit | null = upstream.body;
      if (url.searchParams.has("resolve")) {
        // Bound the metadata body, and resolve only the upstream's signed media route.
        const reader = upstream.body?.getReader();
        if (!reader) return reply(502, "Empty media source response");
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 131072) {
            await reader.cancel();
            return reply(502, "Invalid media source response");
          }
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const note = JSON.parse(new TextDecoder().decode(bytes));
        if (
          note.type !== "Note" ||
          !Array.isArray(note.attachment) ||
          note.attachment.length !== 1
        )
          return reply(502, "Invalid photo metadata");
        const attachment = note.attachment[0];
        if (attachment.mediaType?.startsWith("image/")) {
          const media = new URL(attachment.url);
          const code = url.pathname.split("/")[2];
          if (
            media.origin !== "https://oginstagram.com" ||
            media.pathname !==
              `/offload/${code}/${url.searchParams.get("img_index")}`
          )
            return reply(502, "Invalid media location");
          const redirect = await fetch(media, {
            redirect: "manual",
            signal: AbortSignal.timeout(15_000),
          });
          await redirect.body?.cancel();
          if (redirect.status === 429) {
            headers.set("Cache-Control", "no-store");
            headers.set(
              "Retry-After",
              redirect.headers.get("Retry-After") || "60",
            );
            return reply(429, "Media source temporarily unavailable");
          }
          const target = new URL(
            redirect.headers.get("Location") || "https://invalid.local",
          );
          if (redirect.status !== 302 || !isInstagramCdn(target))
            return reply(502, "No image location available");
          attachment.url = target.href;
        }
        body = JSON.stringify(note);
      }
      headers.set("Cache-Control", "public, max-age=300");
      const response = new Response(body, { headers });
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

function isInstagramCdn(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    ["cdninstagram.com", "fbcdn.net"].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  );
}
