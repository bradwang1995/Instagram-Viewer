import { ObjectDetector } from "@mediapipe/tasks-vision";
import type { PersonBox } from "./personFocus";

let detector: Promise<ObjectDetector> | undefined;

self.onmessage = async (
  event: MessageEvent<{
    id: number;
    url: string;
    width: number;
    height: number;
    baseUrl: string;
  }>,
) => {
  const { id, url, width, height, baseUrl } = event.data;
  let bitmap: ImageBitmap | undefined;
  try {
    detector ??= ObjectDetector.createFromOptions(
      {
        // The ESM loader supports module workers in both Vite dev and Pages builds.
        wasmLoaderPath: `${baseUrl}person-focus/wasm/vision_wasm_module_internal.js`,
        wasmBinaryPath: `${baseUrl}person-focus/wasm/vision_wasm_module_internal.wasm`,
      },
      {
        baseOptions: {
          modelAssetPath: `${baseUrl}person-focus/efficientdet_lite0.tflite`,
        },
        runningMode: "IMAGE",
        categoryAllowlist: ["person"],
        scoreThreshold: 0.35,
        maxResults: 8,
        canvas: new OffscreenCanvas(1, 1),
      },
    );
    const [model, response] = await Promise.all([
      detector,
      fetch(url, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(30_000),
      }),
    ]);
    if (!response.ok) throw new Error("Image unavailable");
    const ratio = Math.min(1, 1280 / Math.max(width, height));
    bitmap = await createImageBitmap(await response.blob(), {
      resizeWidth: Math.max(1, Math.round(width * ratio)),
      resizeHeight: Math.max(1, Math.round(height * ratio)),
    });
    const boxes: PersonBox[] = model.detect(bitmap).detections.flatMap((d) =>
      d.boundingBox
        ? [
            {
              originX: (d.boundingBox.originX * width) / bitmap!.width,
              originY: (d.boundingBox.originY * height) / bitmap!.height,
              width: (d.boundingBox.width * width) / bitmap!.width,
              height: (d.boundingBox.height * height) / bitmap!.height,
            },
          ]
        : [],
    );
    self.postMessage({ id, boxes });
  } catch {
    self.postMessage({ id, boxes: [] });
  } finally {
    bitmap?.close();
  }
};
