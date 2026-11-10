import "@tensorflow/tfjs-backend-webgl";
import {
  browser,
  env,
  expandDims,
  setBackend,
  tidy,
  type Tensor4D,
} from "@tensorflow/tfjs-core";
import { loadLayersModel } from "@tensorflow/tfjs-layers";
import type {
  EnhancementRequest,
  EnhancementResponse,
} from "./photoEnhancement";

const TILE_SIZE = 96;
const TILE_PADDING = 20;
const SCALE = 2;

function post(response: EnhancementResponse) {
  self.postMessage(response);
}

async function readRegion({ bitmap, source, region }: EnhancementRequest) {
  if (bitmap) return bitmap;
  try {
    const response = await fetch(source, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error();
    return await createImageBitmap(
      await response.blob(),
      region.x,
      region.y,
      region.width,
      region.height,
    );
  } catch {
    throw new Error("This photo’s source does not allow enhancement.");
  }
}

self.onmessage = async ({ data }: MessageEvent<EnhancementRequest>) => {
  let bitmap = data.bitmap;
  let model: Awaited<ReturnType<typeof loadLayersModel>> | undefined;
  let error = "Could not enhance this photo. You can still view the original.";
  try {
    error = "GPU enhancement requires WebGL 2 support.";
    if (!(await setBackend("webgl")) || env().getNumber("WEBGL_VERSION") !== 2)
      throw new Error();
    env().set("WEBGL_CPU_FORWARD", false);

    error = "This photo’s source does not allow enhancement.";
    bitmap = await readRegion(data);
    const { width, height } = data.region;
    if (bitmap.width !== width || bitmap.height !== height) throw new Error();
    const source = new OffscreenCanvas(width, height).getContext("2d", {
      willReadFrequently: true,
    })!;
    source.drawImage(bitmap, 0, 0);
    const sourcePixels = source.getImageData(0, 0, width, height);

    error = "Could not load the AI model. Try enhancing again.";
    model = await loadLayersModel(data.modelUrl);
    error = "Could not enhance this photo. You can still view the original.";
    const output = new OffscreenCanvas(width * SCALE, height * SCALE);
    const destination = output.getContext("2d")!;
    const tiles = Math.ceil(width / TILE_SIZE) * Math.ceil(height / TILE_SIZE);
    let processed = 0;
    for (let y = 0; y < height; y += TILE_SIZE) {
      for (let x = 0; x < width; x += TILE_SIZE) {
        const tileWidth = Math.min(TILE_SIZE, width - x);
        const tileHeight = Math.min(TILE_SIZE, height - y);
        const left = Math.max(0, x - TILE_PADDING);
        const top = Math.max(0, y - TILE_PADDING);
        const right = Math.min(width, x + tileWidth + TILE_PADDING);
        const bottom = Math.min(height, y + tileHeight + TILE_PADDING);
        const patch = source.getImageData(
          left,
          top,
          right - left,
          bottom - top,
        );
        // This ESRGAN model uses RGB values from 0–255 for both input and output.
        const tensor = tidy(
          () =>
            model!.predict(
              expandDims(browser.fromPixels(patch), 0),
            ) as Tensor4D,
        );
        try {
          const [, outHeight, outWidth, channels] = tensor.shape;
          if (
            outWidth !== patch.width * SCALE ||
            outHeight !== patch.height * SCALE ||
            channels !== 3
          )
            throw new Error();
          const pixels = await tensor.data();
          const tile = destination.createImageData(
            tileWidth * SCALE,
            tileHeight * SCALE,
          );
          for (let row = 0; row < tile.height; row++) {
            let from =
              ((row + (y - top) * SCALE) * outWidth + (x - left) * SCALE) * 3;
            for (let col = 0; col < tile.width; col++, from += 3) {
              const to = (row * tile.width + col) * 4;
              tile.data[to] = pixels[from];
              tile.data[to + 1] = pixels[from + 1];
              tile.data[to + 2] = pixels[from + 2];
              tile.data[to + 3] =
                sourcePixels.data[
                  ((y + (row >> 1)) * width + x + (col >> 1)) * 4 + 3
                ];
            }
          }
          destination.putImageData(tile, x * SCALE, y * SCALE);
        } finally {
          tensor.dispose();
        }
        post({ progress: Math.round((++processed / tiles) * 100) });
      }
    }
    post({ blob: await output.convertToBlob({ type: "image/png" }) });
  } catch {
    post({ error });
  } finally {
    model?.dispose();
    bitmap?.close();
  }
};
