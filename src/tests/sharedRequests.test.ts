import { expect, it, vi } from "vitest";
import { createSharedRequests } from "../features/media/sharedRequests.mjs";

it("keeps shared work alive for another view and aborts only after the last subscriber leaves", async () => {
  const run = createSharedRequests<string>();
  let underlying!: AbortSignal;
  let finish!: (value: string) => void;
  const work = vi.fn((signal: AbortSignal) => {
    underlying = signal;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  });
  const first = new AbortController();
  const second = new AbortController();
  const a = run("post", work, first.signal).catch((error) => error.name);
  const b = run("post", work, second.signal);
  await Promise.resolve();
  first.abort();
  expect(await a).toBe("AbortError");
  expect(underlying.aborted).toBe(false);
  finish("photo");
  expect(await b).toBe("photo");
  expect(work).toHaveBeenCalledTimes(1);
  const abandoned = new AbortController();
  const c = run("other", work, abandoned.signal).catch((error) => error.name);
  await Promise.resolve();
  abandoned.abort();
  expect(await c).toBe("AbortError");
  expect(underlying.aborted).toBe(true);
});

it("drops work cancelled before it starts and permits a fresh subscriber immediately", async () => {
  const run = createSharedRequests<string>();
  const controller = new AbortController();
  const work = vi.fn().mockResolvedValue("new");
  const old = run("post", work, controller.signal).catch((error) => error.name);
  controller.abort();
  const next = run("post", work);
  expect(await old).toBe("AbortError");
  expect(await next).toBe("new");
  expect(work).toHaveBeenCalledTimes(1);
});
