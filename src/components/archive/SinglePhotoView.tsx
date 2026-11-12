import { RotateCw, Sparkles, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { personZoom } from "../../features/media/personFocus";
import {
  enhancePhotoRegion,
  MAX_ENHANCEMENT_PIXELS,
  type PhotoRegion,
} from "../../features/media/photoEnhancement";
import {
  clampPan,
  easeZoom,
  fitPhoto,
  MAX_ZOOM,
  visiblePhotoRegion,
  zoomAt,
  type Camera,
  type Size,
} from "../../features/media/singlePhotoCamera";
import type { PersonFraming } from "../../hooks/usePersonFocusStyle";

export type OpenedPhoto = {
  src: string;
  alt: string;
  width: number;
  height: number;
  crossOrigin?: "anonymous";
  framing?: PersonFraming | Promise<PersonFraming | undefined>;
};

function covers(region: PhotoRegion, area: PhotoRegion) {
  return (
    region.x <= area.x &&
    region.y <= area.y &&
    region.x + region.width >= area.x + area.width &&
    region.y + region.height >= area.y + area.height
  );
}

function initialCamera(
  photo: Size,
  view: Size,
  framing?: PersonFraming,
): Camera {
  const rotation = framing?.rotation ?? 0;
  const { width, height, scale } = fitPhoto(photo, view, rotation);
  const focus =
    framing &&
    personZoom(
      width,
      height,
      view.width,
      view.height,
      framing.crop,
      "contain",
      framing.strength,
    );
  const zoom = Math.min(MAX_ZOOM, focus?.scale ?? 1);
  const ratio = zoom / (focus?.scale ?? 1);
  return clampPan(
    {
      rotation,
      zoom,
      x: ((focus?.x ?? 0) * ratio) / scale,
      y: ((focus?.y ?? 0) * ratio) / scale,
    },
    photo,
    view,
  );
}

export function SinglePhotoView({
  photo,
  onClose,
}: {
  photo: OpenedPhoto;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ id: number; x: number; y: number }>();
  const displayedCamera = useRef<Camera>();
  const zoomAnimation = useRef<{
    target: Camera;
    frame: number;
    lastTime: number;
  }>();
  const enhancementJob = useRef<AbortController>();
  const enhancementUrl = useRef<string>();
  const [enhanced, setEnhanced] = useState<{
    region: PhotoRegion;
    url: string;
  }>();
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [enhanceError, setEnhanceError] = useState<string>();
  const [view, setView] = useState<Size>();
  const [framing, setFraming] = useState(() =>
    photo.framing instanceof Promise ? undefined : photo.framing,
  );
  const [manualCamera, setCamera] = useState<Camera>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [dragging, setDragging] = useState(false);

  const stopZoom = useCallback(() => {
    const animation = zoomAnimation.current;
    if (animation) window.cancelAnimationFrame(animation.frame);
    zoomAnimation.current = undefined;
  }, []);
  useLayoutEffect(() => stopZoom, [stopZoom, view]);

  useEffect(
    () => () => {
      const job = enhancementJob.current;
      enhancementJob.current = undefined;
      job?.abort();
      if (enhancementUrl.current) URL.revokeObjectURL(enhancementUrl.current);
    },
    [],
  );

  useEffect(() => {
    if (!(photo.framing instanceof Promise)) return;
    let active = true;
    void photo.framing.then((result) => {
      if (active) setFraming(result);
    });
    return () => {
      active = false;
    };
  }, [photo.framing]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const stage = stageRef.current!;
    const previous = document.activeElement;
    dialog.showModal();
    const measure = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (width && height)
        setView((previous) =>
          previous?.width === width && previous.height === height
            ? previous
            : { width, height },
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => {
      observer.disconnect();
      dialog.close();
      if (previous instanceof HTMLElement)
        previous.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    if (!view) return;
    const advance = (timestamp: number) => {
      const animation = zoomAnimation.current;
      const current = displayedCamera.current;
      if (!animation || !current) return;
      const { scale } = fitPhoto(photo, view, current.rotation);
      const next = easeZoom(
        current,
        animation.target,
        timestamp - animation.lastTime,
        scale,
      );
      displayedCamera.current = next;
      setCamera(next);
      if (next === animation.target) {
        zoomAnimation.current = undefined;
        return;
      }
      animation.lastTime = timestamp;
      animation.frame = window.requestAnimationFrame(advance);
    };
    const zoomPhoto = (event: WheelEvent) => {
      event.preventDefault();
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.height : 1;
      if (loadState !== "ready" || !event.deltaY || drag.current) return;
      const current = displayedCamera.current;
      if (!current) return;
      const { left, top } = stage.getBoundingClientRect();
      const cursorX = event.clientX - left - view.width / 2;
      const cursorY = event.clientY - top - view.height / 2;
      const animation = zoomAnimation.current;
      const start = animation?.target ?? current;
      const target = zoomAt(
        start,
        photo,
        view,
        cursorX,
        cursorY,
        event.deltaY * unit,
      );
      if (target.zoom === start.zoom) return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        stopZoom();
        displayedCamera.current = target;
        setCamera(target);
      } else if (animation) {
        animation.target = target;
      } else {
        setCamera(current);
        zoomAnimation.current = {
          target,
          lastTime: performance.now(),
          frame: window.requestAnimationFrame(advance),
        };
      }
    };
    stage.addEventListener("wheel", zoomPhoto, { passive: false });
    return () => stage.removeEventListener("wheel", zoomPhoto);
  }, [loadState, photo, stopZoom, view]);

  const camera =
    view &&
    (manualCamera
      ? clampPan(manualCamera, photo, view)
      : initialCamera(photo, view, framing));
  const scale =
    view && camera ? fitPhoto(photo, view, camera.rotation).scale : 0;
  const canPan = Boolean(
    view && camera && loadState === "ready" && camera.zoom > 1,
  );
  useLayoutEffect(() => {
    displayedCamera.current = camera;
  }, [camera]);
  const area = view && camera && visiblePhotoRegion(photo, view, camera);
  const enhancedHere = Boolean(
    area && enhanced && covers(enhanced.region, area),
  );

  async function enhance() {
    if (enhancementJob.current) {
      enhancementJob.current.abort();
      return;
    }
    if (!view || !camera || !area || !imageRef.current || loadState !== "ready")
      return;
    setEnhanceError(undefined);
    if (enhancedHere) {
      setShowEnhanced((value) => !value);
      return;
    }
    const padded = visiblePhotoRegion(photo, view, camera, 28);
    const region =
      padded.width * padded.height <= MAX_ENHANCEMENT_PIXELS ? padded : area;
    if (region.width * region.height > MAX_ENHANCEMENT_PIXELS) {
      setEnhanceError("Zoom in to enhance a smaller area.");
      return;
    }
    const job = new AbortController();
    enhancementJob.current = job;
    setProgress(0);
    try {
      const result = await enhancePhotoRegion(
        imageRef.current,
        photo.src,
        region,
        job.signal,
        setProgress,
      );
      if (job.signal.aborted) return;
      const url = URL.createObjectURL(result);
      if (enhancementUrl.current) URL.revokeObjectURL(enhancementUrl.current);
      enhancementUrl.current = url;
      setEnhanced({ region, url });
      setShowEnhanced(true);
    } catch (error) {
      if (!job.signal.aborted)
        setEnhanceError(
          error instanceof Error
            ? error.message
            : "Could not enhance this photo.",
        );
    } finally {
      if (enhancementJob.current === job) {
        enhancementJob.current = undefined;
        setProgress(undefined);
      }
    }
  }

  function stopDrag(pointerId: number) {
    if (drag.current?.id !== pointerId) return;
    drag.current = undefined;
    setDragging(false);
  }

  return (
    <dialog
      ref={dialogRef}
      className="single-photo-dialog"
      aria-label="Single photo view"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        type="button"
        className="viewer-control single-photo-close"
        aria-label="Close single photo"
        onClick={onClose}
      >
        <X size={32} aria-hidden="true" />
      </button>
      <div
        ref={stageRef}
        className={`single-photo-stage${dragging ? " is-dragging" : canPan ? " can-pan" : ""}`}
        onPointerDown={(event) => {
          if (!canPan || drag.current || event.button !== 0) return;
          stopZoom();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const pointer = drag.current;
          if (!view || !pointer || pointer.id !== event.pointerId) return;
          const dx = event.clientX - pointer.x;
          const dy = event.clientY - pointer.y;
          pointer.x = event.clientX;
          pointer.y = event.clientY;
          setCamera((previous) => {
            const current = previous
              ? clampPan(previous, photo, view)
              : initialCamera(photo, view, framing);
            const { scale } = fitPhoto(photo, view, current.rotation);
            return clampPan(
              {
                ...current,
                x: current.x + dx / scale,
                y: current.y + dy / scale,
              },
              photo,
              view,
            );
          });
        }}
        onPointerUp={(event) => stopDrag(event.pointerId)}
        onPointerCancel={(event) => stopDrag(event.pointerId)}
        onLostPointerCapture={(event) => stopDrag(event.pointerId)}
      >
        {loadState !== "failed" && (
          <div
            className="single-photo-image"
            style={
              camera && {
                width: photo.width * scale,
                height: photo.height * scale,
                transform: `translate(-50%, -50%) translate(${camera.x * scale}px, ${camera.y * scale}px) scale(${camera.zoom}) rotate(${camera.rotation}deg)`,
              }
            }
          >
            <img
              ref={imageRef}
              src={photo.src}
              alt={photo.alt}
              crossOrigin={photo.crossOrigin}
              referrerPolicy="no-referrer"
              draggable={false}
              onLoad={() => setLoadState("ready")}
              onError={() => setLoadState("failed")}
            />
            {showEnhanced && enhanced && (
              <img
                className="single-photo-enhanced-region"
                src={enhanced.url}
                alt=""
                draggable={false}
                style={{
                  left: `${(enhanced.region.x / photo.width) * 100}%`,
                  top: `${(enhanced.region.y / photo.height) * 100}%`,
                  width: `${(enhanced.region.width / photo.width) * 100}%`,
                  height: `${(enhanced.region.height / photo.height) * 100}%`,
                }}
              />
            )}
          </div>
        )}
        {loadState === "loading" && (
          <span className="single-photo-status" role="status">
            Loading photo…
          </span>
        )}
        {loadState === "failed" && (
          <span className="single-photo-status" role="status">
            Photo could not load.
          </span>
        )}
      </div>
      <div className="single-photo-enhancement">
        {enhanceError && <span role="status">{enhanceError}</span>}
        <button
          type="button"
          className="viewer-control single-photo-enhance"
          aria-label={progress !== undefined ? "Cancel enhancement" : undefined}
          title={
            progress !== undefined
              ? "Cancel enhancement"
              : enhancedHere && showEnhanced
                ? "Show original photo"
                : "Enhance the visible area with 4× AI and sharpening"
          }
          disabled={!view || loadState !== "ready"}
          onClick={() => void enhance()}
        >
          <Sparkles size={18} aria-hidden="true" />
          {progress !== undefined
            ? `Enhancing… ${progress}%`
            : enhancedHere && showEnhanced
              ? "Original"
              : "Enhance"}
        </button>
      </div>
      <button
        type="button"
        className="viewer-control single-photo-rotate"
        aria-label="Rotate photo 90 degrees clockwise"
        title="Rotate 90° clockwise"
        disabled={!view || loadState !== "ready"}
        onClick={() => {
          if (!view) return;
          stopZoom();
          setCamera((previous) => {
            const current = previous
              ? clampPan(previous, photo, view)
              : initialCamera(photo, view, framing);
            return clampPan(
              {
                ...current,
                rotation: (current.rotation + 90) % 360,
                x: -current.y,
                y: current.x,
              },
              photo,
              view,
            );
          });
        }}
      >
        <RotateCw size={24} aria-hidden="true" />
      </button>
    </dialog>
  );
}
