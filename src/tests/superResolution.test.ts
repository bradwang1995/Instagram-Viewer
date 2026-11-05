import { afterEach, beforeEach, expect, it, vi } from "vitest";
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: Record<string, unknown> }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  reply(data: Record<string, unknown>) {
    this.onmessage?.({
      data: {
        id: [...this.postMessage.mock.calls]
          .reverse()
          .find((args) => !args[0].cancel)![0].id,
        ...data,
      },
    });
  }
}
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:enhanced-${Math.random()}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("serializes inference, shares duplicate requests, reports progress and caches actual outputs", async () => {
  const { enhancePhoto } = await import("../features/media/superResolution");
  const progress = vi.fn();
  const signal = new AbortController().signal;
  const a = enhancePhoto("a", signal, progress);
  const duplicate = enhancePhoto("a", signal, vi.fn());
  const b = enhancePhoto("b", signal, vi.fn());
  const worker = FakeWorker.instances[0];
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  worker.reply({ progress: 0.5 });
  expect(progress).toHaveBeenCalledWith(50);
  worker.reply({ blob: new Blob(["ai output"]) });
  expect(await a).toEqual(await duplicate);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  worker.reply({ blob: new Blob(["second output"]) });
  await b;
  expect(await enhancePhoto("a", signal, vi.fn())).toEqual(await a);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
});
it("enhances loaded image pixels instead of depending on a second source fetch", async () => {
  const bitmap = { close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const { enhancePhoto } = await import("../features/media/superResolution");
  const result = enhancePhoto(
    "photo",
    new AbortController().signal,
    vi.fn(),
    new Image(),
  );
  await Promise.resolve();
  const worker = FakeWorker.instances[0];
  expect(worker.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ bitmap }),
    [bitmap],
  );
  worker.reply({ blob: new Blob(["output"]) });
  expect((await result).url).toContain("blob:enhanced");
});
it("allows a new request after a rapid off/on without attaching it to cancelled inference", async () => {
  const { enhancePhoto } = await import("../features/media/superResolution");
  const c = new AbortController();
  const first = enhancePhoto("a", c.signal, vi.fn());
  const worker = FakeWorker.instances[0];
  c.abort();
  expect(await first).toEqual({});
  expect(worker.postMessage).toHaveBeenLastCalledWith({ id: 1, cancel: true });
  const retry = enhancePhoto("a", new AbortController().signal, vi.fn());
  worker.reply({ error: "Cancelled" });
  expect(
    worker.postMessage.mock.calls[worker.postMessage.mock.calls.length - 1][0]
      .id,
  ).toBe(2);
  worker.reply({ blob: new Blob(["output"]) });
  expect((await retry).url).toContain("blob:enhanced");
});
it("settles queued requests on worker failure and can retry without replacing original photos", async () => {
  const { enhancePhoto } = await import("../features/media/superResolution");
  const signal = new AbortController().signal;
  const a = enhancePhoto("a", signal, vi.fn());
  const b = enhancePhoto("b", signal, vi.fn());
  FakeWorker.instances[0].onerror!();
  expect((await a).error).toContain("original photo retained");
  expect((await b).url).toBeUndefined();
  const retry = enhancePhoto("a", signal, vi.fn());
  expect(FakeWorker.instances).toHaveLength(2);
  FakeWorker.instances[1].reply({ error: "Photo unavailable" });
  expect((await retry).error).toBe("Photo unavailable");
});
