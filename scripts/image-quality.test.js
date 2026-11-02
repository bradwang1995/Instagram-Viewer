// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { imageDimensions, isLowResolution } from "./image-quality.mjs";
import { purgeLowQualityCache } from "./purge-low-quality-cache.mjs";
const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
export function jpeg(width, height) {
  const bytes = Buffer.from([
    255, 216, 255, 192, 0, 17, 8, 0, 0, 0, 0, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0,
    255, 217,
  ]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes;
}
it("reads JPEG, PNG and WebP dimensions without changing the image", () => {
  expect(imageDimensions(jpeg(320, 341))).toEqual({ width: 320, height: 341 });
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(1080, 16);
  png.writeUInt32BE(1350, 20);
  expect(imageDimensions(png)).toEqual({ width: 1080, height: 1350 });
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0);
  webp.write("WEBP", 8);
  webp.write("VP8X", 12);
  webp.writeUInt32LE(10, 16);
  webp.writeUIntLE(319, 24, 3);
  webp.writeUIntLE(340, 27, 3);
  expect(imageDimensions(webp)).toEqual({ width: 320, height: 341 });
  expect(isLowResolution(imageDimensions(webp))).toBe(true);
  expect(isLowResolution({ width: 1080, height: 1350 })).toBe(false);
});
it("purges only low-resolution media and manifests referencing it, retaining good photos and unrelated files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "quality-cache-"));
  directories.push(directory);
  await writeFile(path.join(directory, "Post-0.image"), jpeg(320, 341));
  await writeFile(path.join(directory, "Post-1.image"), jpeg(1080, 1350));
  await writeFile(
    path.join(directory, "Post.json"),
    JSON.stringify({
      attachments: [{ kind: "image", width: 320, height: 341 }],
    }),
  );
  await writeFile(
    path.join(directory, "Good.json"),
    JSON.stringify({
      attachments: [{ kind: "image", width: 1080, height: 1350 }],
    }),
  );
  await writeFile(path.join(directory, "keep.txt"), "keep");
  const result = await purgeLowQualityCache(directory);
  expect(result.removedImages).toEqual([
    { name: "Post-0.image", width: 320, height: 341 },
  ]);
  expect(result.removedManifests).toEqual(["Post.json"]);
  expect((await readdir(directory)).sort()).toEqual([
    "Good.json",
    "Post-1.image",
    "keep.txt",
  ]);
});
