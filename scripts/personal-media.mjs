import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";

const codePattern = /^[A-Za-z0-9_-]{1,24}$/;
const imageTypes = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
function failure(status, message) {
  return Object.assign(new Error(message), { status });
}
function imageType(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  throw failure(502, "The media source did not return an image.");
}
export function isInstagramCdn(value) {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    ["cdninstagram.com", "fbcdn.net"].some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith("." + domain),
    )
  );
}
async function boundedBody(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) throw failure(502, "Empty media response.");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) throw failure(502, "Media response is too large.");
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}

export function createPersonalMedia({
  directory,
  fetcher = fetch,
  coreOrigin = "http://127.0.0.1:18081",
  maxBytes = 2 * 1024 ** 3,
  maxFiles = 2000,
}) {
  const flights = new Map();
  const browserOrigin = "https://bradwang1995.github.io";
  const session = randomBytes(32).toString("hex");
  function validSession(value) {
    return (
      typeof value === "string" &&
      /^[a-f0-9]{64}$/.test(value) &&
      timingSafeEqual(Buffer.from(value), Buffer.from(session))
    );
  }
  const cooldowns = new Map();
  let blockedUntil = 0;
  let active = 0;
  const waiting = [];
  const ready = mkdir(directory, { recursive: true });
  async function limited(work) {
    if (waiting.length >= 64)
      throw failure(503, "Local media queue is full. Please retry shortly.");
    if (active >= 2) await new Promise((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
  async function single(key, work) {
    if (flights.has(key)) return flights.get(key);
    const task = work();
    flights.set(key, task);
    try {
      return await task;
    } finally {
      flights.delete(key);
    }
  }
  async function atomic(file, bytes) {
    await writeFile(file + ".tmp", bytes);
    await rename(file + ".tmp", file);
  }
  let eviction = Promise.resolve();
  function prune() {
    eviction = eviction
      .catch(() => {})
      .then(async () => {
        const files = await readdir(directory);
        const entries = (
          await Promise.all(
            files
              .filter((name) => /\.(json|image)$/.test(name))
              .map(async (name) => {
                try {
                  const info = await stat(path.join(directory, name));
                  return { name, size: info.size, time: info.mtimeMs };
                } catch {
                  return undefined;
                }
              }),
          )
        )
          .filter(Boolean)
          .sort((a, b) => a.time - b.time);
        let bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
        let count = entries.length;
        for (const entry of entries) {
          if (bytes <= maxBytes && count <= maxFiles) break;
          await unlink(path.join(directory, entry.name)).catch(() => {});
          bytes -= entry.size;
          count--;
        }
      });
    return eviction;
  }
  async function manifest(code, refresh = false) {
    return single("post:" + code, async () => {
      await ready;
      const file = path.join(directory, code + ".json");
      if (!refresh) {
        try {
          const cached = JSON.parse(await readFile(file, "utf8"));
          if (
            cached.code === code &&
            cached.expires > Date.now() &&
            Array.isArray(cached.attachments)
          )
            return cached;
        } catch {
          /* Cache loss or corruption is recoverable. */
        }
      }
      if (Date.now() < blockedUntil || Date.now() < (cooldowns.get(code) || 0))
        throw failure(
          429,
          "Instagram is temporarily unavailable. Retry in a minute.",
        );
      try {
        const data = await limited(async () => {
          const response = await fetcher(
            `${coreOrigin}/post/${code}${refresh ? "?refresh=1" : ""}`,
            { signal: AbortSignal.timeout(40_000), redirect: "error" },
          );
          if (!response.ok)
            throw failure(
              response.status,
              "Instagram could not load this post.",
            );
          return JSON.parse(
            (await boundedBody(response, 512 * 1024)).toString(),
          );
        });
        if (
          !data.complete ||
          data.post?.Shortcode !== code ||
          !Array.isArray(data.post.Attachments) ||
          data.post.Attachments.length > 50
        )
          throw failure(502, "The post did not return a complete media list.");
        const attachments = data.post.Attachments.map((entry, index) => ({
          index,
          kind: entry.Kind,
          url: entry.URL,
          width: entry.Width,
          height: entry.Height,
        }));
        if (
          !attachments.length ||
          attachments.some((entry) => !isInstagramCdn(entry.url))
        )
          throw failure(502, "Invalid media source.");
        const result = {
          code,
          expires: Date.now() + 6 * 3600_000,
          attachments,
        };
        await atomic(file, JSON.stringify(result));
        await prune();
        cooldowns.delete(code);
        return result;
      } catch (error) {
        cooldowns.set(code, Date.now() + 60_000);
        if (cooldowns.size > 500)
          cooldowns.delete(cooldowns.keys().next().value);
        if (error.status === 429) blockedUntil = Date.now() + 60_000;
        throw error;
      }
    });
  }
  async function image(code, index) {
    return single(`image:${code}:${index}`, async () => {
      await ready;
      const file = path.join(directory, `${code}-${index}.image`);
      try {
        const bytes = await readFile(file);
        const type = imageType(bytes);
        await utimes(file, new Date(), new Date()).catch(() => {});
        return { bytes, type, cached: true };
      } catch {
        /* Read through on missing or invalid cache entries. */
      }
      if (Date.now() < blockedUntil)
        throw failure(
          429,
          "Instagram is temporarily unavailable. Retry in a minute.",
        );
      let post = await manifest(code);
      for (let attempt = 0; attempt < 2; attempt++) {
        const attachment = post.attachments[index];
        if (
          !attachment ||
          attachment.kind !== "image" ||
          !isInstagramCdn(attachment.url)
        )
          throw failure(404, "This photo is unavailable.");
        const { response, bytes } = await limited(async () => {
          const response = await fetcher(attachment.url, {
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
          });
          return {
            response,
            bytes: response.ok
              ? await boundedBody(response, 20 * 1024 ** 2)
              : undefined,
          };
        });
        if ([403, 404, 410].includes(response.status) && attempt === 0) {
          await response.body?.cancel();
          post = await manifest(code, true);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429) blockedUntil = Date.now() + 60_000;
          throw failure(
            response.status === 429 ? 429 : 502,
            "The image source is temporarily unavailable.",
          );
        }
        const type = imageType(bytes);
        await atomic(file, bytes);
        await prune();
        return { bytes, type, cached: false };
      }
    });
  }
  return async function middleware(req, res, next) {
    const url = new URL(req.url, "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/personal/")) return next();
    const origin = req.headers.origin;
    const remote = origin === browserOrigin;
    const cors = remote
      ? {
          "Access-Control-Allow-Origin": browserOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "X-Viewer-Connect",
          "Access-Control-Allow-Private-Network": "true",
          Vary: "Origin",
        }
      : {};
    const reply = (status, body, headers = {}) => {
      res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...cors,
        ...headers,
      });
      res.end(body);
    };
    const sameOrigin = !origin || origin === `http://${req.headers.host}`;
    const crossSite = req.headers["sec-fetch-site"] === "cross-site";
    const authorizedImage =
      !origin &&
      crossSite &&
      /^\/api\/personal\/images\//.test(url.pathname) &&
      validSession(url.searchParams.get("session"));
    if (
      !/^127\.0\.0\.1:\d+$/.test(req.headers.host || "") ||
      (!sameOrigin && !remote) ||
      (crossSite && !remote && !authorizedImage)
    )
      return reply(403, "Local requests only.");
    if (req.method === "OPTIONS" && remote) return reply(204, "");
    if (url.pathname === "/api/personal/connect") {
      if (
        !remote ||
        req.method !== "POST" ||
        req.headers["x-viewer-connect"] !== "1"
      )
        return reply(403, "Connection not allowed.");
      try {
        const health = await fetcher(coreOrigin + "/health", {
          signal: AbortSignal.timeout(3000),
        });
        if (!health.ok) return reply(503, "Core unavailable");
        await health.body?.cancel();
        return reply(200, JSON.stringify({ session }), {
          "Content-Type": "application/json",
        });
      } catch {
        return reply(503, "Core unavailable");
      }
    }
    if (req.method !== "GET") return reply(405, "GET only.");
    if (
      (remote || authorizedImage) &&
      !validSession(url.searchParams.get("session"))
    )
      return reply(401, "Reconnect to the local service.");
    url.searchParams.delete("session");
    try {
      if (url.pathname === "/api/personal/health") {
        const response = await fetcher(coreOrigin + "/health", {
          signal: AbortSignal.timeout(3000),
        });
        return reply(
          response.ok ? 200 : 503,
          response.ok ? "ok" : "Core unavailable",
        );
      }
      const match =
        /^\/api\/personal\/(posts|images)\/([A-Za-z0-9_-]+)(?:\/(\d+))?$/.exec(
          url.pathname,
        );
      if (!match || !codePattern.test(match[2]) || url.search)
        return reply(400, "Invalid media request.");
      const [, kind, code, rawIndex] = match;
      if (kind === "posts" && rawIndex === undefined) {
        const data = await manifest(code);
        return reply(
          200,
          JSON.stringify({
            photos: data.attachments
              .filter((a) => a.kind === "image")
              .map((a) => ({
                sourceIndex: a.index,
                width: a.width,
                height: a.height,
                url: `/api/personal/images/${code}/${a.index}`,
              })),
          }),
          { "Content-Type": "application/json" },
        );
      }
      if (kind !== "images" || !/^(?:[0-9]|[1-4][0-9])$/.test(rawIndex || ""))
        return reply(400, "Invalid photo index.");
      const data = await image(code, Number(rawIndex));
      return reply(200, data.bytes, {
        "Content-Type": imageTypes[data.type],
        "X-Personal-Cache": data.cached ? "HIT" : "MISS",
        "Cache-Control": "private, max-age=3600",
      });
    } catch (error) {
      const status = [403, 404, 410, 429, 502, 503].includes(error.status)
        ? error.status
        : 502;
      return reply(
        status,
        status === 502 && !error.status
          ? "Local media service unavailable. Check the local core log."
          : error.message,
        status === 429 ? { "Retry-After": "60" } : {},
      );
    }
  };
}
