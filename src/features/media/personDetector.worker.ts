import { FaceDetector, ObjectDetector } from "@mediapipe/tasks-vision";
import { personCrop, type PersonBox } from "./personFocus";
import { portraitRotation } from "./personOrientation";

let detector: Promise<ObjectDetector> | undefined;
let faceDetector: Promise<FaceDetector> | undefined;

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
    // A whole-image pass can miss a large, unusually posed foreground person
    // while detecting only swimmers/bystanders. Retry overlapping full-height
    // regions at the same confidence threshold before accepting that result.
    if (boxes.length && !personCrop(width, height, boxes)) {
      const regionWidth = Math.max(1, Math.round(bitmap.width * 0.6));
      const canvas = new OffscreenCanvas(regionWidth, bitmap.height);
      const context = canvas.getContext("2d");
      if (context) {
        for (const fraction of [0, 0.5, 1]) {
          const offsetX = Math.round((bitmap.width - regionWidth) * fraction);
          context.drawImage(
            bitmap,
            offsetX,
            0,
            regionWidth,
            bitmap.height,
            0,
            0,
            regionWidth,
            bitmap.height,
          );
          for (const detection of model.detect(canvas).detections) {
            const b = detection.boundingBox;
            if (!b) continue;
            // Interior crop edges must not turn a cut-off body into a subject.
            const margin = regionWidth * 0.01;
            if (
              (offsetX > 0 && b.originX <= margin) ||
              (offsetX + regionWidth < bitmap.width &&
                b.originX + b.width >= regionWidth - margin)
            )
              continue;
            boxes.push({
              originX: ((offsetX + b.originX) * width) / bitmap.width,
              originY: (b.originY * height) / bitmap.height,
              width: (b.width * width) / bitmap.width,
              height: (b.height * height) / bitmap.height,
            });
          }
        }
      }
    }
    const dominant = personCrop(width, height, boxes);
    let portraitTurn: 90 | -90 | 0 | undefined;
    if (dominant && dominant.width > dominant.height * 0.8) {
      try {
        faceDetector ??= FaceDetector.createFromOptions(
          {
            wasmLoaderPath: `${baseUrl}person-focus/wasm/vision_wasm_module_internal.js`,
            wasmBinaryPath: `${baseUrl}person-focus/wasm/vision_wasm_module_internal.wasm`,
          },
          {
            baseOptions: {
              modelAssetPath: `${baseUrl}person-focus/blaze_face_short_range.tflite`,
            },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.5,
          },
        );
        const faces = (await faceDetector)
          .detect(bitmap)
          .detections.flatMap((d) =>
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
        portraitTurn = portraitRotation(
          {
            originX: dominant.x,
            originY: dominant.y,
            width: dominant.width,
            height: dominant.height,
          },
          faces,
        );
        if (portraitTurn) {
          const main = boxes.find(
            (b) =>
              b.originX <= dominant.x &&
              b.originY <= dominant.y &&
              b.originX + b.width >= dominant.x + dominant.width &&
              b.originY + b.height >= dominant.y + dominant.height,
          );
          if (main) main.rotation = portraitTurn;
        }
      } catch {
        // Optional orientation evidence must not discard successful person detection.
      }
    }
    // Upright subjects stay untouched. For sideways/undetected subjects, ask the
    // same local model which quarter-turn produces a confident upright person.
    if (
      portraitTurn === undefined &&
      (!dominant || dominant.width > dominant.height * 1.2)
    ) {
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
            d.boundingBox &&
            d.boundingBox.height > d.boundingBox.width * 1.2 &&
            personCrop(canvas.width, canvas.height, [d.boundingBox]),
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
