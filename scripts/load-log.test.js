// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createLoadLog } from "./load-log.mjs";

it("serializes writes and bounds disk usage to the current log and two archives", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "load-log-"));
  try {
    const write = createLoadLog(directory, { maxBytes: 100 });
    await Promise.all(
      Array.from({ length: 6 }, (_, index) => write([{ kind: "test", index }])),
    );
    expect((await readdir(directory)).sort()).toEqual([
      "load-events.jsonl",
      "load-events.jsonl.1",
      "load-events.jsonl.2",
    ]);
    const last = JSON.parse(
      (
        await readFile(path.join(directory, "load-events.jsonl"), "utf8")
      ).trim(),
    );
    expect(last.index).toBe(5);
    const restarted = createLoadLog(directory, { maxBytes: 100 });
    await restarted([{ kind: "restart", index: 6 }]);
    expect(
      JSON.parse(
        (
          await readFile(path.join(directory, "load-events.jsonl"), "utf8")
        ).trim(),
      ).index,
    ).toBe(6);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

