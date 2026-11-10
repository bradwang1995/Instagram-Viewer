import { RotateCw, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { personZoom } from "../../features/media/personFocus";
import type { PersonFraming } from "../../hooks/usePersonFocusStyle";

export type OpenedPhoto = {
  src: string;
  alt: string;
  width: number;
  height: number;
  crossOrigin?: "anonymous";
  framing?: PersonFraming;
};

type Size = { width: number; height: number };
// Pan is in image coordinates so resizing the dialog preserves the view.
type Camera = { zoom: number; x: number; y: number; rotation: number };
const MAX_ZOOM = 6;

function fitPhoto(photo: Size, view: Size, rotation: number) {
  const sideways = rotation % 180 !== 0;
  const width = sideways ? photo.height : photo.width;
  const height = sideways ? photo.width : photo.height;
  const scale = Math.min(view.width / width, view.height / height);
  return { width, height, scale };
}

function clampPan(camera: Camera, photo: Size, view: Size): Camera {
  const { width, height, scale } = fitPhoto(photo, view, camera.rotation);
  const limitX = Math.max(0, (width * camera.zoom - view.width / scale) / 2);
  const limitY = Math.max(0, (height * camera.zoom - view.height / scale) / 2);
  return {
    ...camera,
    x: Math.max(-limitX, Math.min(limitX, camera.x)),
    y: Math.max(-limitY, Math.min(limitY, camera.y)),
  };
}

function initialCamera(photo: OpenedPhoto, view: Size): Camera {
  const rotation = photo.framing?.rotation ?? 0;
  const { width, height, scale } = fitPhoto(photo, view, rotation);
  const focus =
    photo.framing &&
    personZoom(
      width,
      height,
      view.width,
      view.height,
      photo.framing.crop,
      "contain",
      photo.framing.strength,
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
  const drag = useRef<{ id: number; x: number; y: number }>();
  const [view, setView] = useState<Size>();
  const [manualCamera, setCamera] = useState<Camera>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const stage = stageRef.current!;
    const previous = document.activeElement;
    dialog.showModal();
    const measure = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (width && height) setView({ width, height });
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
    const zoomPhoto = (event: WheelEvent) => {
      event.preventDefault();
      if (loadState !== "ready" || !event.deltaY) return;
      const { left, top } = stage.getBoundingClientRect();
      const cursorX = event.clientX - left - view.width / 2;
      const cursorY = event.clientY - top - view.height / 2;
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.height : 1;
      setCamera((previous) => {
        const camera = previous
          ? clampPan(previous, photo, view)
          : initialCamera(photo, view);
        const zoom = Math.max(
          1,
          Math.min(
            MAX_ZOOM,
            camera.zoom * Math.exp(-event.deltaY * unit * 0.002),
          ),
        );
        const ratio = zoom / camera.zoom;
        const { scale } = fitPhoto(photo, view, camera.rotation);
        // Keep the pixel under the pointer stationary until reaching an edge.
        return clampPan(
          {
            ...camera,
            zoom,
            x: camera.x * ratio + (cursorX / scale) * (1 - ratio),
            y: camera.y * ratio + (cursorY / scale) * (1 - ratio),
          },
          photo,
          view,
        );
      });
    };
    stage.addEventListener("wheel", zoomPhoto, { passive: false });
    return () => stage.removeEventListener("wheel", zoomPhoto);
  }, [loadState, photo, view]);

  const camera =
    view &&
    (manualCamera
      ? clampPan(manualCamera, photo, view)
      : initialCamera(photo, view));
  const scale =
    view && camera ? fitPhoto(photo, view, camera.rotation).scale : 0;
  const canPan = Boolean(
    view && camera && loadState === "ready" && camera.zoom > 1,
  );

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
              : initialCamera(photo, view);
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
          <img
            src={photo.src}
            alt={photo.alt}
            crossOrigin={photo.crossOrigin}
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={() => setLoadState("ready")}
            onError={() => setLoadState("failed")}
            style={
              camera && {
                width: photo.width * scale,
                height: photo.height * scale,
                transform: `translate(-50%, -50%) translate(${camera.x * scale}px, ${camera.y * scale}px) scale(${camera.zoom}) rotate(${camera.rotation}deg)`,
              }
            }
          />
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
      <button
        type="button"
        className="viewer-control single-photo-rotate"
        aria-label="Rotate photo 90 degrees clockwise"
        title="Rotate 90° clockwise"
        disabled={!view || loadState !== "ready"}
        onClick={() => {
          if (!view) return;
          setCamera((previous) => {
            const current = previous
              ? clampPan(previous, photo, view)
              : initialCamera(photo, view);
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
