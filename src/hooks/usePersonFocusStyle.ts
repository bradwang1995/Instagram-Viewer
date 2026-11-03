import { useEffect, useState, type RefObject, type CSSProperties } from "react";
import { usePersonFocus, personCrop } from "../features/media/personFocus";
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
        const base = Math.min(
          image.clientWidth / image.naturalWidth,
          image.clientHeight / image.naturalHeight,
        );
        const scale = image.naturalWidth / crop.width;
        const x =
          (image.naturalWidth / 2 - crop.x - crop.width / 2) * base * scale;
        const y =
          (image.naturalHeight / 2 - crop.y - crop.height / 2) * base * scale;
        setStyle({
          objectFit: "contain",
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
        });
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
