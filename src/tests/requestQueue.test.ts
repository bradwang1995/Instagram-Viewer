import { describe, expect, it, vi } from "vitest";
import { createRequestQueue } from "../features/media/requestQueue";

describe("media request scheduling", () => {
  it("bounds concurrency and drops cancelled offscreen work before it starts", async () => {
    const run = createRequestQueue(2);
    let finishA!: () => void;
    let finishB!: () => void;
    const a = run(
      () =>
        new Promise<void>((resolve) => {
          finishA = resolve;
        }),
    );
    const b = run(
      () =>
        new Promise<void>((resolve) => {
          finishB = resolve;
        }),
    );
    const cancelled = new AbortController();
    const obsolete = vi.fn().mockResolvedValue(undefined);
    const queued = run(obsolete, cancelled.signal).catch(
      (error: DOMException) => error.name,
    );
    const current = vi.fn().mockResolvedValue("current");
    const next = run(current);
    expect(current).not.toHaveBeenCalled();
    cancelled.abort();
    expect(await queued).toBe("AbortError");
    finishA();
    await a;
    expect(await next).toBe("current");
    expect(obsolete).not.toHaveBeenCalled();
    finishB();
    await b;
  });
});
