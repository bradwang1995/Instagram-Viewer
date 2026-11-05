import * as tf from "@tensorflow/tfjs";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import Upscaler from "upscaler";

let model: Promise<InstanceType<typeof Upscaler>> | undefined;
let active: { id: number; controller: AbortController } | undefined;

self.onmessage = async ({
  data,
}: MessageEvent<{
  id: number;
  url?: string;
  baseUrl: string;
  cancel?: boolean;
  bitmap?: ImageBitmap;
}>) => {
  if (data.cancel) {
    if (active?.id === data.id) active.controller.abort();
    return;
  }
  const { id, url, baseUrl } = data;
  const controller = new AbortController();
  active = { id, controller };
  let bitmap: ImageBitmap | undefined = data.bitmap;
  let input: tf.Tensor3D | undefined;
  let output: tf.Tensor3D | undefined;
  try {
    model ??= (async () => {
      setWasmPaths(`${baseUrl}super-resolution/`);
      tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false);
      if (!(await tf.setBackend("wasm")))
        throw new Error("AI runtime unavailable");
      await tf.ready();
      const upscaler = new Upscaler({
        model: {
          scale: 2,
          modelType: "layers",
          inputRange: [0, 255],
          outputRange: [0, 255],
          path: `${baseUrl}super-resolution/model.json`,
        },
      });
      await upscaler.ready;
      return upscaler;
    })().catch((error) => {
      model = undefined;
      throw error;
    });
    const upscaler = await model;
    if (!bitmap) {
      const response = await fetch(url!, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Photo unavailable");
      bitmap = await createImageBitmap(await response.blob());
    }
    // Do not downsample a large original and present it as increased resolution.
    if (bitmap.width * bitmap.height > 4_000_000)
      throw new Error("This photo exceeds the local 4 MP processing limit");
    if (controller.signal.aborted) throw new Error("Cancelled");
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing unavailable");
    context.drawImage(bitmap, 0, 0);
    input = tf.browser.fromPixels(
      context.getImageData(0, 0, canvas.width, canvas.height),
    );
    output = await upscaler.upscale(input, {
      output: "tensor",
      patchSize: 64,
      padding: 12,
      awaitNextFrame: true,
      signal: controller.signal,
      progress: (progress: number) => self.postMessage({ id, progress }),
    });
    if (controller.signal.aborted) throw new Error("Cancelled");
    const [height, width] = output.shape;
    if (width !== bitmap.width * 2 || height !== bitmap.height * 2)
      throw new Error("Unexpected model output dimensions");
    const pixels = await output.data();
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = pixels[i * 3];
      rgba[i * 4 + 1] = pixels[i * 3 + 1];
      rgba[i * 4 + 2] = pixels[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    const enhanced = new OffscreenCanvas(width, height);
    enhanced
      .getContext("2d")!
      .putImageData(new ImageData(rgba, width, height), 0, 0);
    const blob = await enhanced.convertToBlob({ type: "image/png" });
    if (!controller.signal.aborted)
      self.postMessage({ id, blob, width, height });
    else self.postMessage({ id, error: "Cancelled" });
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error ? error.message : "AI enhancement unavailable",
    });
  } finally {
    input?.dispose();
    output?.dispose();
    bitmap?.close();
    if (active?.id === id) active = undefined;
  }
};
