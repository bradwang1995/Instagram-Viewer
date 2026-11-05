import { afterEach, beforeEach, expect, it, vi } from "vitest";

const detect = vi.hoisted(() => vi.fn());
const detectFaces = vi.hoisted(() => vi.fn());
const createDetector = vi.hoisted(() => vi.fn());
const createFaceDetector = vi.hoisted(() => vi.fn());
vi.mock("@mediapipe/tasks-vision", () => ({
  ObjectDetector: { createFromOptions: createDetector },
  FaceDetector: { createFromOptions: createFaceDetector },
}));
const result = (
  x: number,
  y: number,
  width: number,
  height: number,
  score = 0.8,
) => ({
  detections: [
    {
      boundingBox: { originX: x, originY: y, width, height },
      categories: [{ score }],
    },
  ],
});
let worker: {
  onmessage?: (event: unknown) => Promise<void>;
  postMessage: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.resetModules();
  detect.mockReset();
  createDetector.mockReset().mockResolvedValue({ detect });
  createFaceDetector.mockReset().mockResolvedValue({ detect: detectFaces });
  detectFaces.mockReset().mockReturnValue({ detections: [] });
  worker = { postMessage: vi.fn() };
  vi.stubGlobal("self", worker);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() }),
  );
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 1000,
    height: 800,
    close() {},
  }));
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { translate() {}, rotate() {}, drawImage() {} };
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
async function run(width = 1000, height = 800, bitmap?: unknown) {
  await import("../features/media/personDetector.worker");
  await worker.onmessage!({
    data: { id: 1, url: "photo", width, height, baseUrl: "/", bitmap },
  });
  return worker.postMessage.mock.calls[0][0];
}
it("leaves an upright person untouched", async () => {
  detect.mockReturnValue(result(100, 100, 200, 600));
  expect((await run()).boxes).toEqual([
    { originX: 100, originY: 100, width: 200, height: 600 },
  ]);
  expect(detect).toHaveBeenCalledTimes(1);
});
it("reinitializes after a failed model download instead of caching a rejected model forever", async () => {
  createDetector.mockRejectedValueOnce(new Error("Temporary download failure"));
  detect.mockReturnValue(result(100, 100, 200, 600));
  expect((await run()).failed).toBe(true);
  worker.postMessage.mockClear();
  expect((await run()).boxes).toHaveLength(1);
  expect(createDetector).toHaveBeenCalledTimes(2);
});
it("detects transferred pixels even when refetching the source would fail", async () => {
  const close = vi.fn();
  vi.mocked(fetch).mockRejectedValue(new Error("Refetch blocked"));
  detect.mockReturnValue(result(100, 100, 200, 600));
  expect(
    (await run(1000, 800, { width: 1000, height: 800, close })).boxes,
  ).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
it("orients a reclining foreground person even when quarter-turn person detection would miss it", async () => {
  detect.mockReturnValue(result(15, 50, 900, 700));
  detectFaces.mockReturnValue(result(150, 220, 100, 100));
  expect((await run()).boxes).toEqual([
    { originX: 15, originY: 50, width: 900, height: 700, rotation: 90 },
  ]);
  expect(detect).toHaveBeenCalledTimes(1);
  expect(createFaceDetector.mock.calls[0][0].wasmLoaderPath).not.toBe(
    createDetector.mock.calls[0][0].wasmLoaderPath,
  );
});
it("finds a dark profile face in a rotated body-end crop and ignores a weaker false face", async () => {
  detect.mockReturnValue(result(238, 650, 475, 199));
  detectFaces
    .mockReturnValueOnce(result(0, 0, 30, 30, 0.99))
    .mockReturnValueOnce(result(183, 63, 50, 50, 0.634))
    .mockReturnValueOnce({ detections: [] })
    .mockReturnValueOnce({ detections: [] })
    .mockReturnValueOnce(result(188, 38, 51, 51, 0.65))
    .mockReturnValueOnce({ detections: [] })
    .mockReturnValueOnce(result(34, 45, 47, 47, 0.843));
  const close = vi.fn();
  expect(
    (await run(912, 1086, { width: 912, height: 1086, close })).boxes[0]
      .rotation,
  ).toBe(-90);
  expect(detect).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledOnce();
});
it("does not rotate an upright person with a wide pose when its face is already above its body", async () => {
  detect.mockReturnValue(result(15, 50, 900, 700));
  detectFaces.mockReturnValue(result(400, 80, 100, 100));
  expect((await run()).boxes[0]).not.toHaveProperty("rotation");
  expect(detect).toHaveBeenCalledTimes(1);
});
it("recovers a missed foreground person from overlapping regions instead of focusing a swimmer", async () => {
  const swimmer = result(290, 480, 12, 28);
  detect
    .mockReturnValueOnce(swimmer)
    .mockReturnValueOnce({ detections: [] })
    .mockReturnValueOnce(result(180, 250, 140, 540))
    .mockReturnValueOnce({ detections: [] });
  const { boxes } = await run();
  expect(boxes).toContainEqual({
    originX: 380,
    originY: 250,
    width: 140,
    height: 540,
  });
  const { personCrop } = await import("../features/media/personFocus");
  expect(personCrop(1000, 800, boxes)).toEqual({
    x: 380,
    y: 250,
    width: 140,
    height: 540,
  });
  expect(detect).toHaveBeenCalledTimes(4);
});
it("maps recovery regions back to full-resolution source coordinates", async () => {
  detect
    .mockReturnValueOnce(result(290, 480, 12, 28))
    .mockReturnValueOnce({ detections: [] })
    .mockReturnValueOnce(result(180, 250, 140, 540))
    .mockReturnValueOnce({ detections: [] });
  expect((await run(2000, 1600)).boxes).toContainEqual({
    originX: 760,
    originY: 500,
    width: 280,
    height: 1080,
  });
});
it("preserves a successful no-person result without extra region recovery work", async () => {
  detect.mockReturnValue({ detections: [] });
  expect(await run()).toEqual({ id: 1, boxes: [] });
  expect(detect).toHaveBeenCalledTimes(3);
});
it("keeps small bystanders available for People Only without inventing a focus or rotation", async () => {
  detect.mockReturnValue(result(290, 480, 12, 28));
  const { boxes } = await run();
  expect(boxes.length).toBeGreaterThan(0);
  expect(boxes.every((b: { rotation?: number }) => !b.rotation)).toBe(true);
  const { personCrop } = await import("../features/media/personFocus");
  expect(personCrop(1000, 800, boxes)).toBeNull();
});
it("rejects a foreground fragment touching an interior region edge", async () => {
  detect
    .mockReturnValueOnce(result(290, 480, 12, 28))
    .mockReturnValueOnce(result(520, 100, 80, 600))
    .mockReturnValueOnce(result(0, 100, 150, 600))
    .mockReturnValueOnce(result(0, 100, 150, 600))
    .mockReturnValue({ detections: [] });
  const { boxes } = await run();
  expect(boxes).toEqual([
    { originX: 290, originY: 480, width: 12, height: 28 },
  ]);
});
it.each([90, -90])(
  "chooses the confident upright direction %s and maps back to original pixels",
  async (angle) => {
    detect.mockReturnValueOnce(result(100, 200, 600, 200));
    const good = result(100, 200, 200, 600);
    const weak = result(100, 200, 200, 600, 0.4);
    detect
      .mockReturnValueOnce(angle === 90 ? good : weak)
      .mockReturnValueOnce(angle === -90 ? good : weak);
    const boxes = (await run()).boxes;
    expect(boxes).toEqual([
      angle === 90
        ? { originX: 200, originY: 500, width: 600, height: 200, rotation: 90 }
        : {
            originX: 200,
            originY: 100,
            width: 600,
            height: 200,
            rotation: -90,
          },
    ]);
  },
);
it("distinguishes inference failure from a successful no-person result", async () => {
  detect.mockImplementation(() => {
    throw new Error("Unavailable");
  });
  expect(await run()).toEqual({ id: 1, boxes: [], failed: true });
});
