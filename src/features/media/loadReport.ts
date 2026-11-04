import type { MediaQueueItem } from "./mediaQueue";
import { mediaSource, personalUrl, usesPersonalMedia } from "./personalMedia";
import { queueLocalLoadLog } from "./localLoadLog";

export type LoadDiagnostics = {
  metadataCache?: "hit" | "miss" | "cooldown";
  imageCache?: "hit" | "miss";
  queueMs?: number;
  metadataMs?: number;
  imageMs?: number;
  upstreamRequests?: number;
  requestMs?: number;
  service?: { diagnostics: number; revision: string; startedAt: string };
};
// Only allow explicit diagnostic fields; never export URLs, tokens or response bodies.
export function safeDiagnostics(value: unknown): LoadDiagnostics | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const result: LoadDiagnostics = {};
  if (["hit", "miss", "cooldown"].includes(String(input.metadataCache)))
    result.metadataCache =
      input.metadataCache as LoadDiagnostics["metadataCache"];
  if (["hit", "miss"].includes(String(input.imageCache)))
    result.imageCache = input.imageCache as LoadDiagnostics["imageCache"];
  for (const key of [
    "queueMs",
    "metadataMs",
    "imageMs",
    "upstreamRequests",
    "requestMs",
  ] as const) {
    const number = input[key];
    if (typeof number === "number" && Number.isFinite(number) && number >= 0)
      result[key] = number;
  }
  const service = input.service as Record<string, unknown> | undefined;
  if (
    service &&
    service.diagnostics === 1 &&
    typeof service.revision === "string" &&
    /^(?:[a-f0-9]{7,40}|unknown)$/.test(service.revision) &&
    typeof service.startedAt === "string" &&
    Number.isFinite(Date.parse(service.startedAt))
  )
    result.service = {
      diagnostics: 1,
      revision: service.revision,
      startedAt: service.startedAt,
    };
  return result;
}

export type LoadFailure = {
  status?: number;
  code: string;
  stage: string;
  deferred?: boolean;
  diagnostics?: LoadDiagnostics;
};
export type LoadOutcome = LoadFailure & {
  shortcode: string;
  sourceIndex: number;
  outcome: "loaded" | "failed" | "deferred";
  source: "local" | "default";
  time: string;
  observations: number;
  firstFailure?: { code: string; stage: string; status?: number; time: string };
  history: {
    outcome: "loaded" | "failed" | "deferred";
    code: string;
    stage: string;
    status?: number;
    time: string;
    diagnostics?: LoadDiagnostics;
  }[];
  browserResourceMs?: number;
  gatewayRecordedAt?: string;
};
const KEY = "instagram-viewer:load-report:v2";
export const reportStartedAt = new Date().toISOString();
const sessionId = `${reportStartedAt}:${Math.random()}`;
const LIMIT = 1000;
const rows = new Map<string, LoadOutcome>();
const metadata = new Map<string, LoadDiagnostics>();
export function recordMetadataDiagnostics(
  item: MediaQueueItem,
  value: unknown,
) {
  const diagnostic = safeDiagnostics(value);
  if (!diagnostic) return;
  const key = `${usesPersonalMedia(item) ? "local" : "default"}:${item.post.shortcode ?? item.post.id}`;
  metadata.delete(key);
  metadata.set(key, diagnostic);
  if (metadata.size > LIMIT) metadata.delete(metadata.keys().next().value!);
}
function changed() {
  dirty = true;
  flushTimer ??= setTimeout(flushLoadReport, 250);
}
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
  const previous = rows.get(key);
  const time = new Date().toISOString();
  const actual = failure.deferred ? "deferred" : outcome;
  const diagnostics =
    safeDiagnostics(failure.diagnostics) ??
    metadata.get(`${source}:${shortcode}`);
  const event = {
    outcome: actual,
    code: failure.code,
    stage: failure.stage,
    status: failure.status,
    time,
    diagnostics,
  } as const;
  rows.delete(key);
  const row: LoadOutcome = {
    ...failure,
    shortcode,
    sourceIndex: item.media.sourceIndex,
    outcome: failure.deferred ? "deferred" : outcome,
    source,
    time,
    diagnostics,
    observations: (previous?.observations ?? 0) + 1,
    firstFailure:
      previous?.firstFailure ??
      (actual === "failed"
        ? {
            code: failure.code,
            stage: failure.stage,
            status: failure.status,
            time,
          }
        : undefined),
    history: [...(previous?.history ?? []), event].slice(-8),
  };
  try {
    const url = mediaSource(item);
    if (url && typeof performance.getEntriesByName === "function") {
      const entries = performance.getEntriesByName(
        new URL(url, location.href).href,
        "resource",
      );
      const latest = entries[entries.length - 1];
      if (latest) row.browserResourceMs = Math.round(latest.duration);
    }
  } catch {
    /* Diagnostic timing must never interrupt photo loading. */
  }
  rows.set(key, row);
  queueLocalLoadLog(row, sessionId);
  if (rows.size > LIMIT) rows.delete(rows.keys().next().value!);
  changed();
  // One bounded write/notification per burst, with synchronous reads remaining current.
  if (outcome === "loaded" && usesPersonalMedia(item))
    void enrichGatewayResult(item, row, key);
}

async function enrichGatewayResult(
  item: MediaQueueItem,
  row: LoadOutcome,
  key: string,
) {
  try {
    const response = await fetch(
      personalUrl(
        `/api/personal/diagnostics/${encodeURIComponent(row.shortcode)}/${item.media.sourceIndex}`,
      ),
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return;
    const data = await response.json();
    if (rows.get(key) !== row || data.code !== "loaded" || data.status !== 200)
      return;
    row.diagnostics = safeDiagnostics(data.diagnostics) ?? row.diagnostics;
    row.history[row.history.length - 1].diagnostics = row.diagnostics;
    if (
      typeof data.recordedAt === "string" &&
      Number.isFinite(Date.parse(data.recordedAt))
    )
      row.gatewayRecordedAt = data.recordedAt;
    queueLocalLoadLog(row, sessionId);
    changed();
  } catch {
    /* Older or offline gateways leave diagnostics unknown. */
  }
}

export async function responseFailure(
  response: Response,
  stage: string,
): Promise<LoadFailure> {
  let code = `http_${response.status}`;
  let deferred = false;
  let diagnostics: LoadDiagnostics | undefined;
  try {
    const body = await response.json();
    deferred = body.deferred === true;
    diagnostics = safeDiagnostics(body.diagnostics);
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
    diagnostics,
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
  const previousFailure = readLoadReport().find(
    (row) =>
      row.shortcode === (item.post.shortcode ?? item.post.id) &&
      row.sourceIndex === item.media.sourceIndex &&
      row.source === (usesPersonalMedia(item) ? "local" : "default"),
  )?.firstFailure;
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
          diagnostics: safeDiagnostics(data.diagnostics),
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
  if (current?.outcome === "failed" && current === recorded) {
    // This refines the same observation, rather than counting a second attempt.
    Object.assign(current, failure, {
      outcome: failure.deferred ? "deferred" : "failed",
    });
    current.history[current.history.length - 1] = {
      outcome: current.outcome,
      code: failure.code,
      stage: failure.stage,
      status: failure.status,
      time: current.time,
      diagnostics: safeDiagnostics(failure.diagnostics),
    };
    current.firstFailure =
      previousFailure ??
      (failure.deferred
        ? undefined
        : {
            code: failure.code,
            stage: failure.stage,
            status: failure.status,
            time: current.time,
          });
    queueLocalLoadLog(current, sessionId);
    changed();
  }
}

export function summarizeLoadReport(input = readLoadReport()) {
  const posts = new Map<string, LoadOutcome[]>();
  for (const row of input) {
    const key = `${row.source}:${row.shortcode}`;
    posts.set(key, [...(posts.get(key) ?? []), row]);
  }
  const postResults = [...posts.values()].map((photos) =>
    photos.some((p) => p.outcome === "loaded")
      ? "loaded"
      : photos.some((p) => p.outcome === "failed")
        ? "failed"
        : "deferred",
  );
  const counts = (outcomes: string[]) => ({
    loaded: outcomes.filter((s) => s === "loaded").length,
    failed: outcomes.filter((s) => s === "failed").length,
    deferred: outcomes.filter((s) => s === "deferred").length,
  });
  return {
    photos: counts(input.map((r) => r.outcome)),
    posts: counts(postResults),
    recoveredPhotos: input.filter(
      (r) => r.outcome === "loaded" && r.firstFailure,
    ).length,
  };
}
