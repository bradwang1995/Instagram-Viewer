import type { PersonBox } from "./personFocus";

let detector:
  Promise<import("@mediapipe/tasks-vision").ObjectDetector> | undefined;
const cache = new Map<string, Promise<PersonBox[]>>();

export function detectPerson(url: string): Promise<PersonBox[]> {
  const cached = cache.get(url);
  if (cached) return cached;
  const result = (async () => {
    detector ??= (async () => {
      const { FilesetResolver, ObjectDetector } =
        await import("@mediapipe/tasks-vision");
      return ObjectDetector.createFromOptions(
        await FilesetResolver.forVisionTasks(
          `${import.meta.env.BASE_URL}person-focus/wasm`,
        ),
        {
          baseOptions: {
            modelAssetPath: `${import.meta.env.BASE_URL}person-focus/efficientdet_lite0.tflite`,
          },
          runningMode: "IMAGE",
          categoryAllowlist: ["person"],
          scoreThreshold: 0.35,
          maxResults: 8,
        },
      );
    })();
    // A separate CORS image keeps detection failures from breaking normal media loading.
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.src = url;
    const [model] = await Promise.all([detector, image.decode()]);
    return model
      .detect(image)
      .detections.flatMap((d) => (d.boundingBox ? [d.boundingBox] : []));
  })().catch(() => []);
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(url, result);
  return result;
}
