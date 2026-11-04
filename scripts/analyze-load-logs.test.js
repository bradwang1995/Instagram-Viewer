// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeLoadLogs } from "./analyze-load-logs.mjs";

it("deduplicates refinements across rotation, separates visits and keeps gateway counts separate", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "load-analysis-"));
  const row = {
    shortcode: "Example",
    sourceIndex: 0,
    source: "local",
    outcome: "failed",
    stage: "metadata",
    code: "graphql_error",
  };
  const event = (kind, visit, value) =>
    JSON.stringify({ kind, visit, row: value }) + "\n";
  try {
    await writeFile(
      path.join(directory, "load-events.jsonl.1"),
      event("browser", "first", row),
    );
    await writeFile(
      path.join(directory, "load-events.jsonl"),
      event("browser", "first", {
        ...row,
        outcome: "loaded",
        firstFailure: { code: "graphql_error" },
        diagnostics: { imageCache: "hit", requestMs: 20 },
      }) +
        event("browser", "first", {
          ...row,
          sourceIndex: 1,
          outcome: "loaded",
          diagnostics: { requestMs: 100 },
        }) +
        event("browser", "second", row) +
        event("browser", "second", {
          ...row,
          shortcode: "Deferred",
          outcome: "deferred",
        }) +
        event("gateway", undefined, row) +
        "partial-json",
    );
    const result = await analyzeLoadLogs(directory);
    expect(result.visits).toBe(2);
    expect(result.browser.photos).toEqual({
      loaded: 2,
      failed: 1,
      deferred: 1,
      successRate: 2 / 3,
    });
    expect(result.browser.posts).toEqual({
      loaded: 1,
      failed: 1,
      deferred: 1,
      successRate: 0.5,
    });
    expect(result.browser.recoveredPhotos).toBe(1);
    expect(result.browser.timings.requestMs).toEqual({
      samples: 2,
      p50: 20,
      p95: 100,
    });
    expect(result.gateway.results.failed).toBe(1);
    expect(result.malformedLines).toBe(1);
    expect((await analyzeLoadLogs(directory)).fingerprint).toBe(
      result.fingerprint,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("represents absent data as unknown instead of a zero failure rate", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "load-empty-"));
  try {
    const result = await analyzeLoadLogs(directory);
    expect(result.files).toEqual([]);
    expect(result.browser.posts.successRate).toBeNull();
    expect(result.browser.timings.requestMs).toEqual({
      samples: 0,
      p50: null,
      p95: null,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
