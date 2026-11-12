export type PhotoRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EnhancementRequest = {
  source: string;
  modelUrl: string;
  region: PhotoRegion;
  bitmap?: ImageBitmap;
};

export type EnhancementResponse =
  { progress: number } | { blob: Blob } | { error: string };

export const MAX_ENHANCEMENT_PIXELS = 600_000;

export async function enhancePhotoRegion(
  image: HTMLImageElement,
  source: string,
  region: PhotoRegion,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined")
    throw new Error("GPU enhancement is unavailable in this browser.");

  const { x, y, width, height } = region;
  const bitmap = await createImageBitmap(image, x, y, width, height).catch(
    () => undefined,
  );
  if (signal.aborted) {
    bitmap?.close();
    signal.throwIfAborted();
  }

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("./photoEnhancement.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (error) {
      bitmap?.close();
      reject(error);
      return;
    }
    const finish = (error?: unknown, blob?: Blob) => {
      worker.terminate();
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      if (blob) resolve(blob);
      else reject(error);
    };
    const abort = () => finish(signal.reason);
    const timeout = window.setTimeout(
      () =>
        finish(new Error("Enhancement took too long. Try zooming in further.")),
      90_000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = worker.onmessageerror = () =>
      finish(new Error("GPU enhancement is unavailable in this browser."));
    worker.onmessage = ({ data }: MessageEvent<EnhancementResponse>) => {
      if ("progress" in data) onProgress(data.progress);
      else if ("blob" in data) finish(undefined, data.blob);
      else finish(new Error(data.error));
    };

    const request: EnhancementRequest = {
      source,
      modelUrl: new URL(
        `${import.meta.env.BASE_URL}super-resolution/model.json?v=4`,
        window.location.href,
      ).href,
      region,
    };
    try {
      if (bitmap) {
        try {
          worker.postMessage({ ...request, bitmap }, [bitmap]);
          return;
        } catch {
          // A displayed cross-origin image can be tainted. Try an allowed CORS read.
          bitmap.close();
        }
      }
      worker.postMessage(request);
    } catch (error) {
      finish(error);
    }
  });
}
