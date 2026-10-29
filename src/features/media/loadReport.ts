import type { MediaQueueItem } from "./mediaQueue";
import { personalUrl, usesPersonalMedia } from "./personalMedia";

export type LoadFailure = {
  status?: number;
  code: string;
  stage: string;
};
export type LoadOutcome = LoadFailure & {
  shortcode: string;
  sourceIndex: number;
  outcome: "loaded" | "failed";
  time: string;
};
const KEY = "instagram-viewer:load-report:v1";
const LIMIT = 1000;
let fallback: LoadOutcome[] = [];
let memoryOnly = false;

export function readLoadReport(): LoadOutcome[] {
  if (memoryOnly) return fallback;
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(data)
      ? data
          .filter(
            (entry): entry is LoadOutcome =>
              entry &&
              typeof entry.shortcode === "string" &&
              Number.isInteger(entry.sourceIndex) &&
              typeof entry.code === "string" &&
              typeof entry.stage === "string" &&
              typeof entry.time === "string" &&
              (entry.outcome === "loaded" || entry.outcome === "failed"),
          )
          .slice(-LIMIT)
      : [];
  } catch {
    return fallback;
  }
}

export function recordLoadOutcome(
  item: MediaQueueItem,
  outcome: "loaded" | "failed",
  failure: LoadFailure = { code: "loaded", stage: "image" },
) {
  const shortcode = item.post.shortcode ?? item.post.id;
  const rows = readLoadReport().filter(
    (row) =>
      row.shortcode !== shortcode || row.sourceIndex !== item.media.sourceIndex,
  );
  rows.push({
    ...failure,
    shortcode,
    sourceIndex: item.media.sourceIndex,
    outcome,
    time: new Date().toISOString(),
  });
  fallback = rows.slice(-LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(fallback));
  } catch {
    memoryOnly = true;
    /* Browsing works without storage. */
  }
  window.dispatchEvent(new Event("viewer:load-report-updated"));
}

export async function responseFailure(
  response: Response,
  stage: string,
): Promise<LoadFailure> {
  let code = `http_${response.status}`;
  try {
    const body = await response.json();
    if (
      typeof body.errorCode === "string" &&
      /^[a-z_]{1,60}$/.test(body.errorCode)
    )
      code = body.errorCode;
  } catch {
    /* Some services return plain text or HTML. */
  }
  return { status: response.status, code, stage };
}

export function errorFailure(error: unknown): LoadFailure {
  if (error instanceof MediaLoadError) return error.failure;
  return {
    code:
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout"
        : "network_or_invalid_response",
    stage: "metadata",
  };
}

export class MediaLoadError extends Error {
  constructor(public failure: LoadFailure) {
    super(
      `Media request failed (${failure.status ?? "unknown"}: ${failure.code}).`,
    );
  }
}

// Read the gateway's recorded failure; never download the image again for diagnosis.
export async function recordImageFailure(item: MediaQueueItem) {
  let failure: LoadFailure = { code: "image_load_error", stage: "image" };
  recordLoadOutcome(item, "failed", failure);
  const recordedAt = readLoadReport().find(
    (row) =>
      row.shortcode === (item.post.shortcode ?? item.post.id) &&
      row.sourceIndex === item.media.sourceIndex,
  )?.time;
  if (!usesPersonalMedia(item)) return;
  try {
    const response = await fetch(
      personalUrl(
        `/api/personal/diagnostics/${encodeURIComponent(item.post.shortcode!)}/${item.media.sourceIndex}`,
      ),
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok)
      failure = await responseFailure(response, "local_service");
    else {
      const data = await response.json();
      if (
        typeof data.code === "string" &&
        /^[a-z_0-9]{1,60}$/.test(data.code) &&
        ["metadata", "image", "local_service"].includes(data.stage) &&
        Number.isInteger(data.status) &&
        data.status >= 400 &&
        data.status <= 599
      ) {
        failure = { status: data.status, code: data.code, stage: data.stage };
      }
    }
  } catch {
    /* Unknown failures remain explicitly unclassified. */
  }
  const current = readLoadReport().find(
    (row) =>
      row.shortcode === (item.post.shortcode ?? item.post.id) &&
      row.sourceIndex === item.media.sourceIndex,
  );
  if (current?.outcome === "failed" && current.time === recordedAt)
    recordLoadOutcome(item, "failed", failure);
}
