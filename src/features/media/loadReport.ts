import type { MediaQueueItem } from "./mediaQueue";
import { personalUrl, usesPersonalMedia } from "./personalMedia";

export type LoadFailure = {
  status?: number;
  code: string;
  stage: string;
  deferred?: boolean;
};
export type LoadOutcome = LoadFailure & {
  shortcode: string;
  sourceIndex: number;
  outcome: "loaded" | "failed" | "deferred";
  source: "local" | "default";
  time: string;
};
const KEY = "instagram-viewer:load-report:v2";
export const reportStartedAt = new Date().toISOString();
const sessionId = `${reportStartedAt}:${Math.random()}`;
const LIMIT = 1000;
const rows = new Map<string, LoadOutcome>();
let memoryOnly = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;

export function readLoadReport(): LoadOutcome[] {
  // Each module instance is one visit. Storage from an older visit is never a data source.
  return [...rows.values()];
}

export function flushLoadReport() {
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
  if (!dirty) return;
  dirty = false;
  if (!memoryOnly) {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ sessionId, rows: readLoadReport() }),
      );
    } catch {
      memoryOnly = true;
      /* Browsing and the current report continue without storage. */
    }
  }
  window.dispatchEvent(new Event("viewer:load-report-updated"));
}

window.addEventListener("pagehide", flushLoadReport);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushLoadReport();
});

export function recordLoadOutcome(
  item: MediaQueueItem,
  outcome: "loaded" | "failed",
  failure: LoadFailure = { code: "loaded", stage: "image" },
) {
  if (item.media.sourceKind === "demo") return;
  const source = usesPersonalMedia(item) ? "local" : "default";
  const shortcode = item.post.shortcode ?? item.post.id;
  const key = `${source}:${shortcode}:${item.media.sourceIndex}`;
  rows.delete(key);
  rows.set(key, {
    ...failure,
    shortcode,
    sourceIndex: item.media.sourceIndex,
    outcome: failure.deferred ? "deferred" : outcome,
    source,
    time: new Date().toISOString(),
  });
  if (rows.size > LIMIT) rows.delete(rows.keys().next().value!);
  dirty = true;
  // One bounded write/notification per burst, with synchronous reads remaining current.
  flushTimer ??= setTimeout(flushLoadReport, 250);
}

export async function responseFailure(
  response: Response,
  stage: string,
): Promise<LoadFailure> {
  let code = `http_${response.status}`;
  let deferred = false;
  try {
    const body = await response.json();
    deferred = body.deferred === true;
    if (
      typeof body.errorCode === "string" &&
      /^[a-z_]{1,60}$/.test(body.errorCode)
    )
      code = body.errorCode;
  } catch {
    /* Some services return plain text or HTML. */
  }
  return {
    status: response.status,
    code,
    stage,
    ...(deferred ? { deferred: true } : {}),
  };
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
  const source = usesPersonalMedia(item) ? "local" : "default";
  const recorded = readLoadReport().find(
    (row) =>
      row.shortcode === (item.post.shortcode ?? item.post.id) &&
      row.sourceIndex === item.media.sourceIndex &&
      row.source === source,
  );
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
        failure = {
          status: data.status,
          code: data.code,
          stage: data.stage,
          ...(data.deferred === true ? { deferred: true } : {}),
        };
      }
    }
  } catch {
    /* Unknown failures remain explicitly unclassified. */
  }
  const current = readLoadReport().find(
    (row) =>
      row.shortcode === (item.post.shortcode ?? item.post.id) &&
      row.sourceIndex === item.media.sourceIndex &&
      row.source === source,
  );
  if (current?.outcome === "failed" && current === recorded)
    recordLoadOutcome(item, "failed", failure);
}
