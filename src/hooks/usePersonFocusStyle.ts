import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type CSSProperties,
} from "react";
import {
  usePersonFocus,
  personCrop,
  personZoom,
} from "../features/media/personFocus";
import { detectPerson } from "../features/media/personDetector";

export type PersonFraming = {
  crop: NonNullable<ReturnType<typeof personCrop>>;
  rotation: number;
  strength: number;
};

export function usePersonFocusStyle(
  ref: RefObject<HTMLImageElement>,
  url: string | undefined,
  ready: boolean,
  preparing = ready,
  mediaId?: string,
) {
  const strength = usePersonFocus((s) => s.strength);
  const autoRotate = usePersonFocus((s) => s.autoRotate);
  const peopleOnly = usePersonFocus((s) => s.peopleOnly);

  // Loading photos also hold the control, so it cannot accept a setting before
  // the first inference has even started.
  useEffect(() => {
    if (!preparing || ready) return;
    usePersonFocus.setState((s) => ({ pending: s.pending + 1 }));
    return () => {
      usePersonFocus.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
    };
  }, [preparing, ready]);
  const [layout, setLayout] = useState<{
    crop: PersonFraming["crop"];
    rotation: number;
    geometry: ReturnType<typeof personZoom>;
  }>();
  useEffect(() => {
    setLayout(undefined);
    const image = ref.current;
    if (!ready || !url || !image) return;
    usePersonFocus.setState((s) => ({ pending: s.pending + 1 }));
    let pending = true;
    const finish = () => {
      if (!pending) return;
      pending = false;
      usePersonFocus.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
    };
    const surface = image.parentElement ?? image;
    const controller = new AbortController();
    let observer: ResizeObserver | undefined;
    const request = async () => {
      let boxes = await detectPerson(
        url,
        image.naturalWidth,
        image.naturalHeight,
        controller.signal,
        image,
      );
      if (boxes === null && peopleOnly && !controller.signal.aborted)
        boxes = await detectPerson(
          url,
          image.naturalWidth,
          image.naturalHeight,
          controller.signal,
          image,
        );
      return boxes;
    };
    void request().then((boxes) => {
      finish();
      if (controller.signal.aborted) return;
      if (boxes === null) {
        if (peopleOnly) usePersonFocus.setState({ detectionError: true });
        return;
      }
      if (mediaId)
        usePersonFocus.setState((s) => ({
          people: { ...s.people, [mediaId]: boxes.length > 0 },
        }));
      const crop = personCrop(image.naturalWidth, image.naturalHeight, boxes);
      if (!crop) return;
      const angle = autoRotate ? (crop.rotation ?? 0) : 0;
      const width = angle ? image.naturalHeight : image.naturalWidth;
      const height = angle ? image.naturalWidth : image.naturalHeight;
      const orientedCrop =
        angle === 90
          ? {
              x: image.naturalHeight - crop.y - crop.height,
              y: crop.x,
              width: crop.height,
              height: crop.width,
            }
          : angle === -90
            ? {
                x: crop.y,
                y: image.naturalWidth - crop.x - crop.width,
                width: crop.height,
                height: crop.width,
              }
            : crop;
      const update = () =>
        setLayout({
          crop: orientedCrop,
          rotation: angle,
          geometry: personZoom(
            width,
            height,
            surface.clientWidth,
            surface.clientHeight,
            orientedCrop,
            getComputedStyle(image).objectFit,
          ),
        });
      update();
      observer = new ResizeObserver(update);
      observer.observe(surface);
    });
    return () => {
      finish();
      controller.abort();
      observer?.disconnect();
    };
  }, [ready, url, ref, autoRotate, peopleOnly, mediaId]);
  const { geometry, rotation = 0 } = layout ?? {};
  const progress = Math.min(100, strength) / 100;
  const originalTransform =
    "translate(-50%, -50%) translate(0px, 0px) scale(1)";
  const transform = geometry
    ? `translate(-50%, -50%) translate(${geometry.x * progress}px, ${geometry.y * progress}px) scale(${1 + (geometry.scale - 1) * progress})${rotation ? ` rotate(${rotation}deg)` : ""}`
    : originalTransform;
  const animation = useRef<Animation>();
  const previous = useRef<{ url: string | undefined; transform: string }>();
  useLayoutEffect(() => {
    const image = ref.current;
    if (!geometry || !ready || !image) {
      animation.current?.cancel();
      previous.current = undefined;
      return;
    }
    const from =
      previous.current && previous.current.url === url
        ? animation.current?.playState === "running"
          ? getComputedStyle(image).transform
          : previous.current.transform
        : originalTransform;
    animation.current?.cancel();
    if (
      from !== transform &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      animation.current = image.animate?.(
        [{ transform: from }, { transform }],
        {
          duration: 600,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
      );
    }
    previous.current = { url, transform };
  }, [geometry, ready, url, transform, ref]);
  useEffect(() => () => animation.current?.cancel(), []);
  const style: CSSProperties = { transition: "none" };
  const framing = layout && { crop: layout.crop, rotation, strength };
  if (!geometry) return { style, framing };
  // Render the full image at its original fitted size before scaling/panning it.
  // Transforming an object-fit-clipped element would permanently cut off limbs.
  return {
    framing,
    style: {
      ...style,
      position: "absolute",
      left: "50%",
      top: "50%",
      width: rotation ? geometry.drawnHeight : geometry.drawnWidth,
      height: rotation ? geometry.drawnWidth : geometry.drawnHeight,
      maxWidth: "none",
      transform,
    } satisfies CSSProperties,
  };
}
