import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

// A fixed allowlist prevents browser input from persisting URLs, tokens or bodies.
export function sanitizeLoadRow(row) {
  if (
    !row ||
    !/^[\w-]{1,24}$/.test(row.shortcode ?? "") ||
    !Number.isInteger(row.sourceIndex) ||
    row.sourceIndex < 0 ||
    row.sourceIndex > 49 ||
    !["loaded", "failed", "deferred"].includes(row.outcome) ||
    row.source !== "local"
  )
    throw new Error("Invalid load result.");
  const result = {
    shortcode: row.shortcode,
    sourceIndex: row.sourceIndex,
    source: "local",
    outcome: row.outcome,
  };
  for (const key of ["code", "stage"])
    if (typeof row[key] === "string" && /^[a-z_0-9]{1,60}$/.test(row[key]))
      result[key] = row[key];
  for (const key of ["time", "gatewayRecordedAt"])
    if (
      typeof row[key] === "string" &&
      /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(row[key]) &&
      Number.isFinite(Date.parse(row[key]))
    )
      result[key] = row[key];
  for (const key of ["status", "observations", "browserResourceMs"])
    if (Number.isSafeInteger(row[key]) && row[key] >= 0) result[key] = row[key];
  if (row.diagnostics && typeof row.diagnostics === "object") {
    const diagnostic = {};
    for (const key of [
      "queueMs",
      "metadataMs",
      "imageMs",
      "requestMs",
      "upstreamRequests",
    ])
      if (Number.isFinite(row.diagnostics[key]) && row.diagnostics[key] >= 0)
        diagnostic[key] = row.diagnostics[key];
    for (const key of ["metadataCache", "imageCache"])
      if (["hit", "miss", "cooldown"].includes(row.diagnostics[key]))
        diagnostic[key] = row.diagnostics[key];
    const service = row.diagnostics.service;
    if (service && /^(?:[a-f0-9]{7,40}|unknown)$/.test(service.revision ?? ""))
      diagnostic.service = {
        revision: service.revision,
        diagnostics: 1,
        ...(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(service.startedAt ?? "") &&
        Number.isFinite(Date.parse(service.startedAt))
          ? { startedAt: service.startedAt }
          : {}),
      };
    result.diagnostics = diagnostic;
  }
  if (row.firstFailure) {
    const failure = sanitizeLoadRow({
      code: row.firstFailure.code,
      stage: row.firstFailure.stage,
      status: row.firstFailure.status,
      time: row.firstFailure.time,
      shortcode: row.shortcode,
      sourceIndex: row.sourceIndex,
      source: "local",
      outcome: "failed",
    });
    result.firstFailure = {
      code: failure.code,
      stage: failure.stage,
      status: failure.status,
      time: failure.time,
    };
  }
  if (Array.isArray(row.history))
    result.history = row.history.slice(-8).map((event) => {
      const clean = sanitizeLoadRow({
        ...event,
        history: undefined,
        firstFailure: undefined,
        shortcode: row.shortcode,
        sourceIndex: row.sourceIndex,
        source: "local",
      });
      return {
        outcome: clean.outcome,
        code: clean.code,
        stage: clean.stage,
        status: clean.status,
        time: clean.time,
        diagnostics: clean.diagnostics,
      };
    });
  return result;
}

export function createLoadLog(directory, { maxBytes = 5 * 1024 * 1024 } = {}) {
  const file = path.join(directory, "load-events.jsonl");
  let chain = Promise.resolve();
  let pending = 0;
  return async (events) => {
    if (pending >= 100) throw new Error("Local log queue full.");
    const lines = events
      .map(
        (event) =>
          JSON.stringify({
            schemaVersion: 1,
            recordedAt: new Date().toISOString(),
            ...event,
          }) + "\n",
      )
      .join("");
    const size = Buffer.byteLength(lines);
    if (size > maxBytes) throw new Error("Local log batch too large.");
    pending++;
    const task = chain
      .catch(() => {})
      .then(async () => {
        await mkdir(directory, { recursive: true });
        let current = 0;
        try {
          current = (await stat(file)).size;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (current + size > maxBytes) {
          await unlink(file + ".2").catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
          await rename(file + ".1", file + ".2").catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
          await rename(file, file + ".1").catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
        await appendFile(file, lines, "utf8");
      });
    chain = task;
    try {
      await task;
    } finally {
      pending--;
    }
  };
}
