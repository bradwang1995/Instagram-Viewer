import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageDimensions, isLowResolution } from "./image-quality.mjs";

export async function purgeLowQualityCache(directory) {
  const root = path.resolve(directory);
  const removedImages = [],
    removedManifests = [];
  for (const name of await readdir(root)) {
    if (!/^[\w-]+(?:\.json|\.image)$/.test(name)) continue;
    const target = path.resolve(root, name);
    if (path.dirname(target) !== root)
      throw new Error("Cache path escaped its directory.");
    const bytes = await readFile(target);
    if (name.endsWith(".image")) {
      const size = imageDimensions(bytes);
      if (!isLowResolution(size)) continue;
      await unlink(target);
      removedImages.push({ name, ...size });
    } else {
      let data;
      try {
        data = JSON.parse(bytes.toString());
      } catch {
        continue;
      }
      if (
        !Array.isArray(data.attachments) ||
        !data.attachments.some(
          (entry) => entry.kind === "image" && isLowResolution(entry),
        )
      )
        continue;
      await unlink(target);
      removedManifests.push(name);
    }
  }
  return { removedImages, removedManifests };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(
    JSON.stringify(
      await purgeLowQualityCache(
        path.resolve("embed-lab.local/personal/images"),
      ),
    ),
  );
}
