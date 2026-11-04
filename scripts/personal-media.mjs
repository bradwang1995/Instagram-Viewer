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
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { imageDimensions, isLowResolution } from "./image-quality.mjs";
import { createSharedRequests } from "../src/features/media/sharedRequests.mjs";
import { createLoadLog, sanitizeLoadRow } from "./load-log.mjs";

function qualityFailure() {
  return Object.assign(failure(422, "Low-resolution photo rejected."), {
    errorCode: "low_resolution",
    stage: "image",
  });
}

const codePattern = /^[A-Za-z0-9_-]{1,24}$/;
const imageTypes = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
let revision = "unknown";
try {
  revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  /* Source archives may not include Git. */
}
const serviceVersion = {
  diagnostics: 1,
  revision,
  startedAt: new Date().toISOString(),
};
function combineMetrics(first = {}, second = {}) {
  const result = { ...first, ...second };
  for (const key of ["queueMs", "metadataMs", "imageMs", "upstreamRequests"])
    if (key in first || key in second)
      result[key] = (first[key] ?? 0) + (second[key] ?? 0);
  return result;
}
function failure(status, message) {
  return Object.assign(new Error(message), { status });
}
function cooldownFailure(stage) {
  return Object.assign(
    failure(429, "Instagram is temporarily unavailable. Retry in a minute."),
    {
      errorCode: "cooldown",
      stage,
      deferred: true,
    },
  );
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
  const writeLog = createLoadLog(path.join(directory, "load-logs"));
  let logWarning = false;
  const logGateway = async (row) => {
    try {
      await writeLog([{ kind: "gateway", row: sanitizeLoadRow(row) }]);
    } catch {
      if (!logWarning)
        console.warn(
          "Local load log could not be written; check disk space and folder permissions.",
        );
      logWarning = true;
    }
  };
  const single = createSharedRequests();
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
  const failures = new Map();
  let blockedUntil = 0;
  let active = 0;
  const waiting = [];
  const cacheEntries = new Map();
  let cacheBytes = 0;
  let mutations = Promise.resolve();
  // Scan once per gateway lifetime. Writes and touches keep this index current.
  const ready = mkdir(directory, { recursive: true }).then(async () => {
    const files = await readdir(directory);
    await Promise.all(
      files
        .filter((name) => /^[\w-]+\.(json|image)$/.test(name))
        .map(async (name) => {
          try {
            const info = await stat(path.join(directory, name));
            cacheEntries.set(name, {
              name,
              size: info.size,
              time: info.mtimeMs,
            });
            cacheBytes += info.size;
          } catch {
            /* A concurrent cleanup may already have removed an entry. */
          }
        }),
    );
    await prune();
  });
  async function limited(work, signal, metrics, stage) {
    const queuedAt = performance.now();
    signal?.throwIfAborted();
    if (waiting.length >= 64)
      throw failure(503, "Local media queue is full. Please retry shortly.");
    if (active >= 2)
      await new Promise((resolve, reject) => {
        const abort = () => {
          const index = waiting.indexOf(start);
          if (index >= 0) waiting.splice(index, 1);
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const start = () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        waiting.push(start);
        signal?.addEventListener("abort", abort, { once: true });
      });
    else active++;
    if (metrics) metrics.queueMs += Math.round(performance.now() - queuedAt);
    try {
      signal?.throwIfAborted();
      const started = performance.now();
      try {
        return await work();
      } finally {
        if (metrics)
          metrics[`${stage}Ms`] += Math.round(performance.now() - started);
      }
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
  async function atomic(file, bytes) {
    const task = mutations
      .catch(() => {})
      .then(async () => {
        await ready;
        await writeFile(file + ".tmp", bytes);
        await rename(file + ".tmp", file);
        const name = path.basename(file);
        cacheBytes -= cacheEntries.get(name)?.size ?? 0;
        const size = Buffer.byteLength(bytes);
        cacheEntries.set(name, { name, size, time: Date.now() });
        cacheBytes += size;
        await prune();
      });
    mutations = task;
    return task;
  }
  async function touch(file) {
    const time = new Date();
    const entry = cacheEntries.get(path.basename(file));
    if (entry) entry.time = time.getTime();
    await utimes(file, time, time).catch(() => {});
  }
  function forget(file) {
    const name = path.basename(file);
    const entry = cacheEntries.get(name);
    if (entry) {
      cacheBytes -= entry.size;
      cacheEntries.delete(name);
    }
  }
  async function prune() {
    if (cacheBytes <= maxBytes && cacheEntries.size <= maxFiles) return;
    const entries = [...cacheEntries.values()].sort((a, b) => a.time - b.time);
    for (const entry of entries) {
      if (cacheBytes <= maxBytes && cacheEntries.size <= maxFiles) break;
      const file = path.join(directory, entry.name);
      try {
        await unlink(file);
      } catch (error) {
        if (error.code !== "ENOENT") continue;
      }
      forget(file);
    }
  }
  async function manifest(code, refresh = false, signal) {
    return single(
      "post:" + code,
      async (sharedSignal) => {
        const metrics = {
          metadataCache: "miss",
          queueMs: 0,
          metadataMs: 0,
          upstreamRequests: 0,
        };
        await ready;
        sharedSignal.throwIfAborted();
        const file = path.join(directory, code + ".json");
        if (!refresh) {
          try {
            const cached = JSON.parse(await readFile(file, "utf8"));
            if (
              cached.code === code &&
              cached.expires > Date.now() &&
              Array.isArray(cached.attachments)
            )
              return {
                ...cached,
                diagnostics: { ...metrics, metadataCache: "hit" },
              };
          } catch {
            /* Cache loss or corruption is recoverable. */
          }
        }
        const cooldown = cooldowns.get(code);
        if (cooldown && Date.now() < cooldown.until)
          throw Object.assign(
            new Error(cooldown.error.message),
            cooldown.error,
            {
              deferred: true,
              diagnostics: { ...metrics, metadataCache: "cooldown" },
            },
          );
        if (Date.now() < blockedUntil)
          throw Object.assign(cooldownFailure("metadata"), {
            diagnostics: { ...metrics, metadataCache: "cooldown" },
          });
        try {
          const data = await limited(
            async () => {
              if (Date.now() < blockedUntil) throw cooldownFailure("metadata");
              metrics.upstreamRequests++;
              const response = await fetcher(
                `${coreOrigin}/post/${code}${refresh ? "?refresh=1" : ""}`,
                {
                  signal: AbortSignal.any([
                    sharedSignal,
                    AbortSignal.timeout(40_000),
                  ]),
                  redirect: "error",
                },
              );
              if (response.status === 429) blockedUntil = Date.now() + 60_000;
              if (!response.ok) {
                let errorCode = `http_${response.status}`;
                try {
                  const body = JSON.parse(
                    (await boundedBody(response, 8192)).toString(),
                  );
                  if (
                    typeof body.errorCode === "string" &&
                    /^[a-z_]{1,60}$/.test(body.errorCode)
                  )
                    errorCode = body.errorCode;
                } catch {
                  /* Preserve the HTTP status even without a JSON body. */
                }
                throw Object.assign(
                  failure(
                    response.status,
                    "Instagram could not load this post.",
                  ),
                  { errorCode, stage: "metadata" },
                );
              }
              return JSON.parse(
                (await boundedBody(response, 512 * 1024)).toString(),
              );
            },
            sharedSignal,
            metrics,
            "metadata",
          );
          sharedSignal.throwIfAborted();
          if (
            !data.complete ||
            data.post?.Shortcode !== code ||
            !Array.isArray(data.post.Attachments) ||
            data.post.Attachments.length > 50
          )
            throw failure(
              502,
              "The post did not return a complete media list.",
            );
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
          cooldowns.delete(code);
          return { ...result, diagnostics: metrics };
        } catch (error) {
          if (sharedSignal.aborted) throw error;
          error.stage ??= "metadata";
          error.diagnostics ??= metrics;
          if (!error.deferred)
            cooldowns.set(code, { until: Date.now() + 60_000, error });
          if (cooldowns.size > 500)
            cooldowns.delete(cooldowns.keys().next().value);
          if (error.status === 429 && !error.deferred)
            blockedUntil = Date.now() + 60_000;
          throw error;
        }
      },
      signal,
    );
  }
  async function image(code, index, signal) {
    return single(
      `image:${code}:${index}`,
      async (sharedSignal) => {
        const metrics = {
          imageCache: "miss",
          queueMs: 0,
          imageMs: 0,
          upstreamRequests: 0,
        };
        let metadata;
        try {
          await ready;
          sharedSignal.throwIfAborted();
          const file = path.join(directory, `${code}-${index}.image`);
          try {
            const bytes = await readFile(file);
            const type = imageType(bytes);
            if (isLowResolution(imageDimensions(bytes))) {
              await unlink(file);
              forget(file);
              throw qualityFailure();
            }
            await touch(file);
            return {
              bytes,
              type,
              cached: true,
              diagnostics: { ...metrics, imageCache: "hit" },
            };
          } catch (error) {
            if (error.errorCode === "low_resolution") throw error;
            /* Read through on missing or invalid cache entries. */
          }
          if (Date.now() < blockedUntil) throw cooldownFailure("image");
          let post = await manifest(code, false, sharedSignal);
          metadata = post.diagnostics;
          for (let attempt = 0; attempt < 2; attempt++) {
            const attachment = post.attachments[index];
            if (isLowResolution(attachment)) throw qualityFailure();
            if (
              !attachment ||
              attachment.kind !== "image" ||
              !isInstagramCdn(attachment.url)
            )
              throw failure(404, "This photo is unavailable.");
            const { response, bytes } = await limited(
              async () => {
                if (Date.now() < blockedUntil) throw cooldownFailure("image");
                metrics.upstreamRequests++;
                const response = await fetcher(attachment.url, {
                  redirect: "error",
                  signal: AbortSignal.any([
                    sharedSignal,
                    AbortSignal.timeout(30_000),
                  ]),
                });
                if (response.status === 429) blockedUntil = Date.now() + 60_000;
                return {
                  response,
                  bytes: response.ok
                    ? await boundedBody(response, 20 * 1024 ** 2)
                    : undefined,
                };
              },
              sharedSignal,
              metrics,
              "image",
            );
            sharedSignal.throwIfAborted();
            if ([403, 404, 410].includes(response.status) && attempt === 0) {
              await response.body?.cancel();
              post = await manifest(code, true, sharedSignal);
              metadata = combineMetrics(metadata, post.diagnostics);
              continue;
            }
            if (!response.ok) {
              await response.body?.cancel();
              if (response.status === 429) blockedUntil = Date.now() + 60_000;
              throw Object.assign(
                failure(
                  response.status === 429 ? 429 : 502,
                  "The image source is temporarily unavailable.",
                ),
                {
                  errorCode: `http_${response.status}`,
                  upstreamStatus: response.status,
                  stage: "image",
                },
              );
            }
            const type = imageType(bytes);
            if (isLowResolution(imageDimensions(bytes))) throw qualityFailure();
            await atomic(file, bytes);
            return {
              bytes,
              type,
              cached: false,
              diagnostics: combineMetrics(metadata, metrics),
            };
          }
        } catch (error) {
          throw Object.assign(new Error(error.message), error, {
            name: error.name,
            diagnostics: combineMetrics(
              combineMetrics(metadata, error.diagnostics),
              metrics,
            ),
          });
        }
      },
      signal,
    );
  }
  return async function middleware(req, res, next) {
    const requestStarted = performance.now();
    const url = new URL(req.url, "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/personal/")) return next();
    const controller = new AbortController();
    req.once?.("aborted", () => controller.abort());
    res.once?.("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    const signal = controller.signal;
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
      if (signal.aborted || res.destroyed) return;
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
    if (
      (remote || authorizedImage) &&
      !validSession(url.searchParams.get("session"))
    )
      return reply(401, "Reconnect to the local service.");
    url.searchParams.delete("session");
    if (url.pathname === "/api/personal/load-log" && req.method === "POST") {
      if (url.search) return reply(400, "Invalid log request.");
      try {
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 256 * 1024) return reply(413, "Log batch too large.");
          chunks.push(Buffer.from(chunk));
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          !/^[\dT:Z.\-]{20,40}:[\d.]{1,24}$/.test(data.visit ?? "") ||
          !/^(?:[a-f0-9]{7,40}|unknown)$/.test(data.revision ?? "") ||
          !Array.isArray(data.rows) ||
          !data.rows.length ||
          data.rows.length > 50
        )
          return reply(400, "Invalid log batch.");
        let events;
        try {
          events = data.rows.map((row) => ({
            kind: "browser",
            visit: data.visit,
            revision: data.revision,
            row: sanitizeLoadRow(row),
          }));
        } catch {
          return reply(400, "Invalid log result.");
        }
        try {
          await writeLog(events);
        } catch {
          return reply(503, "Local log could not be written.");
        }
        return reply(204, "");
      } catch {
        return reply(400, "Invalid log body.");
      }
    }
    if (req.method !== "GET") return reply(405, "GET only.");
    try {
      if (url.pathname === "/api/personal/health") {
        const response = await fetcher(coreOrigin + "/health", {
          signal: AbortSignal.timeout(3000),
        });
        return reply(
          response.ok ? 200 : 503,
          response.ok ? "ok" : "Core unavailable",
          { "X-Viewer-Service-Revision": revision },
        );
      }
      const match =
        /^\/api\/personal\/(posts|images|diagnostics)\/([A-Za-z0-9_-]+)(?:\/(\d+))?$/.exec(
          url.pathname,
        );
      const quality = url.searchParams.get("quality");
      const cover = url.searchParams.get("cover");
      if (quality === "2") url.searchParams.delete("quality");
      if (cover === "1") url.searchParams.delete("cover");
      if (!match || !codePattern.test(match[2]) || url.search)
        return reply(400, "Invalid media request.");
      const [, kind, code, rawIndex] = match;
      if (
        kind === "diagnostics" &&
        /^(?:[0-9]|[1-4][0-9])$/.test(rawIndex || "")
      ) {
        return reply(
          200,
          JSON.stringify(failures.get(`${code}:${rawIndex}`) ?? {}),
          { "Content-Type": "application/json" },
        );
      }
      if (kind === "posts" && rawIndex === undefined) {
        const data = await manifest(code, false, signal);
        await logGateway({
          shortcode: code,
          sourceIndex: 0,
          source: "local",
          outcome: "loaded",
          code: "metadata_loaded",
          stage: "metadata",
          diagnostics: { ...data.diagnostics, service: serviceVersion },
          time: new Date().toISOString(),
        });
        return reply(
          200,
          JSON.stringify({
            diagnostics: {
              ...data.diagnostics,
              requestMs: Math.round(performance.now() - requestStarted),
              service: serviceVersion,
            },
            photos: data.attachments
              .filter((a) => a.kind === "image" && !isLowResolution(a))
              .map((a) => ({
                sourceIndex: a.index,
                width: a.width,
                height: a.height,
                url: `/api/personal/images/${code}/${a.index}?quality=2`,
              })),
          }),
          { "Content-Type": "application/json" },
        );
      }
      if (kind !== "images" || !/^(?:[0-9]|[1-4][0-9])$/.test(rawIndex || ""))
        return reply(400, "Invalid photo index.");
      await ready;
      let data;
      if (cover === "1" && rawIndex === "0") {
        // Keep good cached covers available even when the upstream is offline.
        const file = path.join(directory, `${code}-0.image`);
        try {
          const bytes = await readFile(file);
          const size = imageDimensions(bytes);
          if (isLowResolution(size)) {
            await unlink(file);
            forget(file);
          } else if (size) {
            const type = imageType(bytes);
            await touch(file);
            data = {
              bytes,
              type,
              cached: true,
              diagnostics: {
                imageCache: "hit",
                queueMs: 0,
                imageMs: 0,
                upstreamRequests: 0,
              },
            };
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (!data) {
          const post = await manifest(code, false, signal);
          const candidates = post.attachments
            .filter((a) => a.kind === "image" && !isLowResolution(a))
            .slice(0, 2);
          for (const candidate of candidates) {
            try {
              data = await image(code, candidate.index, signal);
              data = {
                ...data,
                diagnostics: combineMetrics(post.diagnostics, data.diagnostics),
              };
              break;
            } catch (error) {
              if (error.errorCode !== "low_resolution") throw error;
            }
          }
          if (!data) throw qualityFailure();
        }
      } else {
        data = await image(code, Number(rawIndex), signal);
      }
      failures.delete(`${code}:${rawIndex}`);
      failures.set(`${code}:${rawIndex}`, {
        code: "loaded",
        stage: "image",
        status: 200,
        diagnostics: {
          ...data.diagnostics,
          requestMs: Math.round(performance.now() - requestStarted),
          service: serviceVersion,
        },
        recordedAt: new Date().toISOString(),
      });
      if (failures.size > 1000) failures.delete(failures.keys().next().value);
      await logGateway({
        ...failures.get(`${code}:${rawIndex}`),
        shortcode: code,
        sourceIndex: Number(rawIndex),
        source: "local",
        outcome: "loaded",
      });
      return reply(200, data.bytes, {
        "Content-Type": imageTypes[data.type],
        "X-Personal-Cache": data.cached ? "HIT" : "MISS",
        "Cache-Control": "private, max-age=3600",
      });
    } catch (error) {
      if (signal.aborted) return;
      const status = [
        400, 401, 403, 404, 410, 422, 429, 451, 502, 503, 504,
      ].includes(error.status)
        ? error.status
        : 502;
      const diagnostic = {
        diagnostics: {
          ...error.diagnostics,
          requestMs: Math.round(performance.now() - requestStarted),
          service: serviceVersion,
        },
        recordedAt: new Date().toISOString(),
        status: error.upstreamStatus ?? status,
        code:
          error.errorCode ??
          (error.name === "TimeoutError" ? "timeout" : `http_${status}`),
        stage: error.stage ?? "image",
        ...(error.deferred ? { deferred: true } : {}),
      };
      const imageMatch =
        /^\/api\/personal\/images\/([A-Za-z0-9_-]+)\/(\d+)$/.exec(url.pathname);
      if (imageMatch) {
        const key = `${imageMatch[1]}:${imageMatch[2]}`;
        failures.delete(key);
        failures.set(key, diagnostic);
        if (failures.size > 1000) failures.delete(failures.keys().next().value);
      }
      const logMatch =
        /^\/api\/personal\/(?:images|posts)\/([A-Za-z0-9_-]+)(?:\/(\d+))?$/.exec(
          url.pathname,
        );
      if (logMatch && codePattern.test(logMatch[1]))
        await logGateway({
          ...diagnostic,
          shortcode: logMatch[1],
          sourceIndex: Number(logMatch[2] ?? 0),
          source: "local",
          outcome: diagnostic.deferred ? "deferred" : "failed",
        });
      return reply(
        status,
        JSON.stringify({
          errorCode: diagnostic.code,
          diagnostics: diagnostic.diagnostics,
          ...(error.deferred ? { deferred: true } : {}),
          message:
            status === 502 && !error.status
              ? "Local media service unavailable. Check the local core log."
              : error.message,
        }),
        {
          "Content-Type": "application/json",
          ...(status === 429 ? { "Retry-After": "60" } : {}),
        },
      );
    }
  };
}
