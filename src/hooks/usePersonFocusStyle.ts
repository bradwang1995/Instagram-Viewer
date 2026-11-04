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
  const enabled = usePersonFocus((s) => s.enabled);
  const [style, setStyle] = useState<CSSProperties>();
  useEffect(() => {
    setStyle(undefined);
    const image = ref.current;
    if (!enabled || !ready || !url || !image) return;
    let cancelled = false;
    const controller = new AbortController();
    let observer: ResizeObserver | undefined;
    void detectPerson(
      url,
      image.naturalWidth,
      image.naturalHeight,
      controller.signal,
    ).then((boxes) => {
      if (cancelled) return;
      const crop = personCrop(image.naturalWidth, image.naturalHeight, boxes);
      if (!crop) return;
      const update = () => {
        const zoom = personZoom(
          image.naturalWidth,
          image.naturalHeight,
          image.clientWidth,
          image.clientHeight,
          crop,
          getComputedStyle(image).objectFit,
        );
        setStyle(
          zoom
            ? {
                transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
              }
            : undefined,
        );
      };
      update();
      observer = new ResizeObserver(update);
      observer.observe(image);
    });
    return () => {
      cancelled = true;
      controller.abort();
      observer?.disconnect();
    };
  }, [enabled, ready, url, ref]);
  return enabled ? { ...style, transition: "none" } : undefined;
}
