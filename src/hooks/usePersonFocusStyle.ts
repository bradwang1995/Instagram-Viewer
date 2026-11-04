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

export function usePersonFocusStyle(
  ref: RefObject<HTMLImageElement>,
  url: string | undefined,
  ready: boolean,
  preparing = ready,
) {
  const strength = usePersonFocus((s) => s.strength);

  // Loading photos also hold the control, so it cannot accept a setting before
  // the first inference has even started.
  useEffect(() => {
    if (!preparing || ready) return;
    usePersonFocus.setState((s) => ({ pending: s.pending + 1 }));
    return () =>
      usePersonFocus.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
  }, [preparing, ready]);
  const [geometry, setGeometry] = useState<ReturnType<typeof personZoom>>(null);
  useEffect(() => {
    setGeometry(null);
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
    void detectPerson(
      url,
      image.naturalWidth,
      image.naturalHeight,
      controller.signal,
    ).then((boxes) => {
      finish();
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
      finish();
      controller.abort();
      observer?.disconnect();
    };
  }, [ready, url, ref]);
  const progress = strength / 100;
  const originalTransform =
    "translate(-50%, -50%) translate(0px, 0px) scale(1)";
  const transform = geometry
    ? `translate(-50%, -50%) translate(${geometry.x * progress}px, ${geometry.y * progress}px) scale(${1 + (geometry.scale - 1) * progress})`
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
  if (!geometry) return style;
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
    transform,
  } satisfies CSSProperties;
}
