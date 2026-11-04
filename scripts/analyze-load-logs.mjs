import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultDirectory = fileURLToPath(
  new URL("../embed-lab.local/personal/images/load-logs/", import.meta.url),
);
const counts = (rows) => {
  const result = { loaded: 0, failed: 0, deferred: 0 };
  for (const row of rows) if (row.outcome in result) result[row.outcome]++;
  return {
    ...result,
    successRate:
      result.loaded + result.failed
        ? result.loaded / (result.loaded + result.failed)
        : null,
  };
};
function latency(values) {
  const sorted = values
    .filter(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    )
    .sort((a, b) => a - b);
  const percentile = (p) =>
    sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
  return {
    samples: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
  };
}
function reasons(rows) {
  const groups = new Map();
  for (const row of rows.filter((r) => r.outcome === "failed")) {
    const key = `${row.stage ?? "unknown"}:${row.code ?? "unknown"}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...groups].sort((a, b) => b[1] - a[1]));
}
export async function analyzeLoadLogs(directory = defaultDirectory) {
  const latest = new Map();
  const gateway = [];
  const files = [];
  const hash = createHash("sha256");
  let malformedLines = 0;
  let ignoredEvents = 0;
  let firstRecordedAt;
  let lastRecordedAt;
  for (const name of [
    "load-events.jsonl.2",
    "load-events.jsonl.1",
    "load-events.jsonl",
  ]) {
    let text;
    try {
      text = await readFile(path.join(directory, name), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    files.push(name);
    hash.update(name).update(text);
    for (const line of text.split("\n").filter((value) => value.trim())) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        malformedLines++;
        continue;
      }
      const row = event?.row;
      if (
        !row ||
        !["loaded", "failed", "deferred"].includes(row.outcome) ||
        typeof row.shortcode !== "string" ||
        !Number.isInteger(row.sourceIndex)
      ) {
        ignoredEvents++;
        continue;
      }
      if (
        typeof event.recordedAt === "string" &&
        Number.isFinite(Date.parse(event.recordedAt))
      ) {
        if (!firstRecordedAt || event.recordedAt < firstRecordedAt)
          firstRecordedAt = event.recordedAt;
        if (!lastRecordedAt || event.recordedAt > lastRecordedAt)
          lastRecordedAt = event.recordedAt;
      }
      if (event.kind === "browser" && typeof event.visit === "string") {
        const key = `${event.visit}:${row.shortcode}:${row.sourceIndex}`;
        // Files are processed in append order, including same-time diagnostic refinements.
        latest.set(key, {
          ...row,
          visit: event.visit,
          revision: event.revision ?? "unknown",
        });
      } else if (event.kind === "gateway") gateway.push(row);
      else ignoredEvents++;
    }
  }
  const photos = [...latest.values()];
  const posts = new Map();
  for (const row of photos) {
    const key = `${row.visit}:${row.shortcode}`;
    posts.set(key, [...(posts.get(key) ?? []), row]);
  }
  const postRows = [...posts.values()].map((rows) => ({
    outcome: rows.some((r) => r.outcome === "loaded")
      ? "loaded"
      : rows.some((r) => r.outcome === "failed")
        ? "failed"
        : "deferred",
  }));
  const timings = {};
  for (const field of ["queueMs", "metadataMs", "imageMs", "requestMs"])
    timings[field] = latency(photos.map((r) => r.diagnostics?.[field]));
  timings.browserResourceMs = latency(photos.map((r) => r.browserResourceMs));
  const cache = (field) =>
    Object.fromEntries(
      ["hit", "miss", "cooldown", "unknown"].map((value) => [
        value,
        photos.filter((r) => (r.diagnostics?.[field] ?? "unknown") === value)
          .length,
      ]),
    );
  return {
    schemaVersion: 1,
    fingerprint: hash.digest("hex"),
    files,
    firstRecordedAt,
    lastRecordedAt,
    malformedLines,
    ignoredEvents,
    scope:
      "Retained rotated logs only. Latest browser outcome per visit/post/photo; post success means at least one photo loaded. Gateway entries are separate observations, not unique upstream requests. Shared-operation timings and cached results are not end-to-end latency; no request counts are summed.",
    visits: new Set(photos.map((r) => r.visit)).size,
    revisions: [...new Set(photos.map((r) => r.revision))],
    browser: {
      photos: counts(photos),
      posts: counts(postRows),
      failures: reasons(photos),
      recoveredPhotos: photos.filter(
        (r) => r.outcome === "loaded" && r.firstFailure,
      ).length,
      partiallyLoadedPosts: [...posts.values()].filter(
        (rows) =>
          rows.some((r) => r.outcome === "loaded") &&
          rows.some((r) => r.outcome !== "loaded"),
      ).length,
      timings,
      metadataCache: cache("metadataCache"),
      imageCache: cache("imageCache"),
    },
    gateway: { results: counts(gateway), failures: reasons(gateway) },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const summary = await analyzeLoadLogs();
  if (process.argv.includes("--save")) {
    await mkdir(defaultDirectory, { recursive: true });
    await writeFile(
      path.join(defaultDirectory, "latest-summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}
