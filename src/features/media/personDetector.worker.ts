import { ObjectDetector } from "@mediapipe/tasks-vision";
import { personCrop, type PersonBox } from "./personFocus";

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
    const dominant = personCrop(width, height, boxes);
    // Upright subjects stay untouched. For sideways/undetected subjects, ask the
    // same local model which quarter-turn produces a confident upright person.
    if (!dominant || dominant.width > dominant.height * 1.2) {
      let bestScore = 0;
      let rotatedBoxes: PersonBox[] | undefined;
      for (const rotation of [90, -90] as const) {
        const canvas = new OffscreenCanvas(bitmap.height, bitmap.width);
        const context = canvas.getContext("2d");
        if (!context) continue;
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate((rotation * Math.PI) / 180);
        context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        const detections = model.detect(canvas).detections;
        const upright = detections.filter(
          (d) =>
            d.boundingBox && d.boundingBox.height > d.boundingBox.width * 1.2,
        );
        const score = Math.max(
          0,
          ...upright.map((d) => d.categories[0]?.score ?? 0),
        );
        if (score <= bestScore) continue;
        bestScore = score;
        rotatedBoxes = upright.map((d) => {
          const b = d.boundingBox!;
          return rotation === 90
            ? {
                originX: (b.originY * width) / bitmap!.width,
                originY:
                  ((bitmap!.height - b.originX - b.width) * height) /
                  bitmap!.height,
                width: (b.height * width) / bitmap!.width,
                height: (b.width * height) / bitmap!.height,
                rotation,
              }
            : {
                originX:
                  ((bitmap!.width - b.originY - b.height) * width) /
                  bitmap!.width,
                originY: (b.originX * height) / bitmap!.height,
                width: (b.height * width) / bitmap!.width,
                height: (b.width * height) / bitmap!.height,
                rotation,
              };
        });
      }
      if (rotatedBoxes) boxes.splice(0, boxes.length, ...rotatedBoxes);
    }
    self.postMessage({ id, boxes });
  } catch {
    self.postMessage({ id, boxes: [], failed: true });
  } finally {
    bitmap?.close();
  }
};
