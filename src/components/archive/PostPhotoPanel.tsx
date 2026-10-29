import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { TransitionPreset } from "../../db/schema";
import { loadPostPhotos } from "../../features/media/instagramMedia";
import type { MediaQueueItem } from "../../features/media/mediaQueue";
import type { ArchiveTab } from "./ArchiveChrome";
import { ArchivePreview } from "./ArchivePreview";
import { ArchiveSlideshow } from "./ArchiveSlideshow";
import {
  errorFailure,
  recordLoadOutcome,
} from "../../features/media/loadReport";

export function PostPhotoPanel({
  item,
  knownItems,
  initialDwellMs,
  initialPreset,
  onClose,
  onUnavailable,
}: {
  item: MediaQueueItem;
  knownItems: MediaQueueItem[];
  initialDwellMs: number;
  initialPreset: TransitionPreset;
  onClose: () => void;
  onUnavailable?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loadedItems, setItems] = useState<MediaQueueItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ArchiveTab>("ribbon");
  const [selectedId, setSelectedId] = useState<string>();
  const [direction, setDirection] = useState<1 | -1>(1);
  const [dwellMs, setDwellMs] = useState(initialDwellMs);
  const [preset, setPreset] = useState(initialPreset);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const items = useMemo(
    () => loadedItems.filter((entry) => !failedIds.has(entry.media.id)),
    [loadedItems, failedIds],
  );
  const visibleIds = useMemo(
    () => new Set(items.map((entry) => entry.media.id)),
    [items],
  );
  const selectedIndex = Math.max(
    0,
    items.findIndex((entry) => entry.media.id === selectedId),
  );
  const selected = items[selectedIndex];

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    dialogRef.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setFailedIds(new Set());
    void loadPostPhotos(item, knownItems)
      .then((photos) => {
        if (!active) return;
        setItems(photos);
        setSelectedId(photos[0]?.media.id);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        recordLoadOutcome(item, "failed", errorFailure(reason));
        onUnavailable?.();
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load this post's photos.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item, knownItems, onUnavailable]);

  const move = useCallback(
    (step: 1 | -1) => {
      if (items.length < 2) return;
      setDirection(step);
      setSelectedId(
        items[(selectedIndex + step + items.length) % items.length].media.id,
      );
    },
    [items, selectedIndex],
  );
  useEffect(() => {
    if (tab !== "slideshow" || items.length < 2) return;
    const timer = window.setTimeout(() => move(1), dwellMs);
    return () => window.clearTimeout(timer);
  }, [tab, dwellMs, move]);
  const onPhotoUnavailable = useCallback((id: string) => {
    setFailedIds((previous) => new Set(previous).add(id));
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="post-photo-panel"
      aria-label={`Photos in post ${item.post.shortcode ?? item.post.id}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <button
        className="viewer-control post-panel-close"
        aria-label="Close post photos"
        onClick={onClose}
      >
        <X size={22} />
      </button>
      {loading || error || !items.length ? (
        <div className="post-panel-message" role={error ? "alert" : "status"}>
          <strong>
            {loading
              ? "Loading post photos…"
              : error || "No photos in this post."}
          </strong>
        </div>
      ) : (
        <>
          {tab !== "slideshow" ? (
            <ArchivePreview
              items={items}
              visibleItemIds={visibleIds}
              selectedId={selected?.media.id}
              viewMode={tab}
              hasFilters={false}
              isImporting={false}
              keyboardNavigationEnabled
              photoLevel
              onSelect={setSelectedId}
              onMediaUnavailable={onPhotoUnavailable}
              onImport={() => {}}
              onViewModeChange={setTab}
              onStartSlideshow={() => setTab("slideshow")}
            />
          ) : (
            <ArchiveSlideshow
              open
              photoLevel
              item={selected}
              direction={direction}
              previousItem={
                items.length > 1
                  ? items[(selectedIndex - 1 + items.length) % items.length]
                  : undefined
              }
              nextItem={
                items.length > 1
                  ? items[(selectedIndex + 1) % items.length]
                  : undefined
              }
              dwellMs={dwellMs}
              transitionPreset={preset}
              isImporting={false}
              onPrevious={() => move(-1)}
              onNext={() => move(1)}
              onTabChange={setTab}
              onImport={() => {}}
              onDwellChange={setDwellMs}
              onTransitionPresetChange={setPreset}
              onUnavailable={onPhotoUnavailable}
            />
          )}
          <span className="post-photo-count">
            {selectedIndex + 1} / {items.length} photos
          </span>
        </>
      )}
    </dialog>
  );
}
