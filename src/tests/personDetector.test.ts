import { afterEach, beforeEach, expect, it, vi } from "vitest";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: { id: number; boxes: unknown[] } }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  reply(boxes: unknown[] = []) {
    this.onmessage?.({
      data: {
        id: this.postMessage.mock.calls[
          this.postMessage.mock.calls.length - 1
        ][0].id,
        boxes,
      },
    });
  }
}
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const request = (
  detect: typeof import("../features/media/personDetector").detectPerson,
  url: string,
  controller = new AbortController(),
) => detect(url, 900, 1160, controller.signal);

it("runs one worker job at a time, shares duplicates, and caches results", async () => {
  const { detectPerson } = await import("../features/media/personDetector");
  const first = request(detectPerson, "first");
  const duplicate = request(detectPerson, "first");
  const second = request(detectPerson, "second");
  const worker = FakeWorker.instances[0];
  expect(FakeWorker.instances).toHaveLength(1);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  const boxes = [{ originX: 20, originY: 30, width: 200, height: 600 }];
  worker.reply(boxes);
  expect(await first).toEqual(boxes);
  expect(await duplicate).toEqual(boxes);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  worker.reply();
  await second;
  expect(await request(detectPerson, "first")).toEqual(boxes);
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
});

it("skips queued work after the card leaves without cancelling another subscriber", async () => {
  const { detectPerson } = await import("../features/media/personDetector");
  const first = request(detectPerson, "first");
  const controller = new AbortController();
  const abandoned = request(detectPerson, "abandoned", controller);
  const sharedController = new AbortController();
  const shared = request(detectPerson, "shared", sharedController);
  const remaining = request(detectPerson, "shared");
  controller.abort();
  sharedController.abort();
  expect(await abandoned).toEqual([]);
  expect(await shared).toEqual([]);
  const worker = FakeWorker.instances[0];
  worker.reply();
  await first;
  expect(worker.postMessage.mock.calls[1][0].url).toBe(
    new URL("shared", window.location.href).href,
  );
  worker.reply();
  await remaining;
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
});

it("settles active and queued work when the worker crashes or times out", async () => {
  const { detectPerson } = await import("../features/media/personDetector");
  const first = request(detectPerson, "first");
  const second = request(detectPerson, "second");
  vi.advanceTimersByTime(45_000);
  expect(await first).toEqual([]);
  expect(await second).toEqual([]);
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  expect(await request(detectPerson, "third")).toEqual([]);
});

it("falls back to the original image when workers are unsupported", async () => {
  vi.stubGlobal("Worker", undefined);
  const { detectPerson } = await import("../features/media/personDetector");
  expect(await request(detectPerson, "first")).toEqual([]);
});
