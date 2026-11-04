import { afterEach, beforeEach, expect, it, vi } from "vitest";

const detect = vi.hoisted(() => vi.fn());
vi.mock("@mediapipe/tasks-vision", () => ({
  ObjectDetector: { createFromOptions: async () => ({ detect }) },
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
      getContext() {
        return { translate() {}, rotate() {}, drawImage() {} };
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
async function run() {
  await import("../features/media/personDetector.worker");
  await worker.onmessage!({
    data: { id: 1, url: "photo", width: 1000, height: 800, baseUrl: "/" },
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
