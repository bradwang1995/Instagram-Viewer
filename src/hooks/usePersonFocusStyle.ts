import { useEffect, useState, type RefObject, type CSSProperties } from "react";
import {
  usePersonFocus,
  personCrop,
  personZoom,
} from "../features/media/personFocus";
import { detectPerson } from "../features/media/personDetector";

export function usePersonFocusStyle(
  ref: RefObject<HTMLImageElement>,
  url: string | undefined,
  ready: boolean,
) {
  const strength = usePersonFocus((s) => s.strength);
  const enabled = strength > 0;
  const [geometry, setGeometry] = useState<ReturnType<typeof personZoom>>(null);
  useEffect(() => {
    setGeometry(null);
    const image = ref.current;
    if (!enabled || !ready || !url || !image) return;
    const surface = image.parentElement ?? image;
    const controller = new AbortController();
    let observer: ResizeObserver | undefined;
    void detectPerson(
      url,
      image.naturalWidth,
      image.naturalHeight,
      controller.signal,
    ).then((boxes) => {
      if (controller.signal.aborted) return;
      const crop = personCrop(image.naturalWidth, image.naturalHeight, boxes);
      if (!crop) return;
      const update = () =>
        setGeometry(
          personZoom(
            image.naturalWidth,
            image.naturalHeight,
            surface.clientWidth,
            surface.clientHeight,
            crop,
            getComputedStyle(image).objectFit,
          ),
        );
      update();
      observer = new ResizeObserver(update);
      observer.observe(surface);
    });
    return () => {
      controller.abort();
      observer?.disconnect();
    };
  }, [enabled, ready, url, ref]);
  const style: CSSProperties = { transition: "none" };
  // Keep transitions disabled while restoring normal layout at zero, too.
  // Otherwise the stylesheet animates the removed centering translation.
  if (!enabled || !geometry) return style;
  const progress = strength / 100;
  // Render the full image at its original fitted size before scaling/panning it.
  // Transforming an object-fit-clipped element would permanently cut off limbs.
  return {
    ...style,
    position: "absolute",
    left: "50%",
    top: "50%",
    width: geometry.drawnWidth,
    height: geometry.drawnHeight,
    maxWidth: "none",
    transform: `translate(-50%, -50%) translate(${geometry.x * progress}px, ${geometry.y * progress}px) scale(${1 + (geometry.scale - 1) * progress})`,
  } satisfies CSSProperties;
}
