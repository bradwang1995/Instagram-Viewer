import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePeopleFilter } from "../../hooks/usePeopleFilter";
import type { TransitionPreset } from "../../db/schema";
import { loadPostPhotos } from "../../features/media/instagramMedia";
import type { MediaQueueItem } from "../../features/media/mediaQueue";
import { ArchiveControlBar, type ArchiveTab } from "./ArchiveChrome";
import { ArchivePreview } from "./ArchivePreview";
import { ArchiveSlideshow } from "./ArchiveSlideshow";
import { SinglePhotoView, type OpenedPhoto } from "./SinglePhotoView";
import { usesPersonalMedia } from "../../features/media/personalMedia";
import {
  errorFailure,
  recordLoadOutcome,
} from "../../features/media/loadReport";

const failedPhotosThisVisit = new Map<string, Set<string>>();

export function PostPhotoPanel({
  item,
  knownItems,
  initialDwellMs,
  initialPreset,
  onClose,
}: {
  item: MediaQueueItem;
  knownItems: MediaQueueItem[];
  initialDwellMs: number;
  initialPreset: TransitionPreset;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const failureKey = `${usesPersonalMedia(item) ? "local" : "default"}:${item.post.id}:${item.post.updatedAt}`;
  const [loadedItems, setItems] = useState<MediaQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ArchiveTab>("ribbon");
  const [selectedId, setSelectedId] = useState<string>();
  const [openedPhoto, setOpenedPhoto] = useState<OpenedPhoto>();
  const [direction, setDirection] = useState<1 | -1>(1);
  const [slideGeneration, setSlideGeneration] = useState(0);
  const [dwellMs, setDwellMs] = useState(initialDwellMs);
  const [preset, setPreset] = useState(initialPreset);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const availableItems = useMemo(
    () => loadedItems.filter((entry) => !failedIds.has(entry.media.id)),
    [loadedItems, failedIds],
  );
  const items = usePeopleFilter(availableItems);
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
    const controller = new AbortController();
    setLoading(true);
    setFailedIds(new Set(failedPhotosThisVisit.get(failureKey)));
    void loadPostPhotos(item, knownItems, controller.signal)
      .then((photos) => {
        if (controller.signal.aborted) return;
        setItems(photos);
        setSelectedId(photos[0]?.media.id);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        recordLoadOutcome(item, "failed", errorFailure(reason));
        // A manifest failure must not discard a cover that already loaded successfully.
        setItems([item]);
        setSelectedId(item.media.id);
        setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [item, knownItems, failureKey]);

  const move = useCallback(
    (step: 1 | -1) => {
      if (items.length < 2) return;
      setDirection(step);
      setSlideGeneration((value) => value + 1);
      setSelectedId(
        items[(selectedIndex + step + items.length) % items.length].media.id,
      );
    },
    [items, selectedIndex],
  );
  const onPhotoUnavailable = useCallback(
    (id: string) => {
      const failures =
        failedPhotosThisVisit.get(failureKey) ?? new Set<string>();
      failures.add(id);
      failedPhotosThisVisit.set(failureKey, failures);
      setFailedIds(new Set(failures));
    },
    [failureKey],
  );

  return (
    <>
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
        {loading || !items.length ? (
          <div className="post-panel-message" role="status">
            <strong>
              {loading
                ? "Loading post photos…"
                : "No matching photos in this post."}
            </strong>
            {!loading && <ArchiveControlBar />}
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
                keyboardNavigationEnabled={!openedPhoto}
                photoLevel
                onSelect={setSelectedId}
                onOpenPhoto={setOpenedPhoto}
                onMediaUnavailable={onPhotoUnavailable}
                onImport={() => {}}
                onViewModeChange={setTab}
                onStartSlideshow={() => setTab("slideshow")}
              />
            ) : (
              <ArchiveSlideshow
                loadGeneration={slideGeneration}
                open
                photoLevel
                playing={!openedPhoto}
                keyboardNavigationEnabled={!openedPhoto}
                onOpenPhoto={setOpenedPhoto}
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
      {openedPhoto && (
        <SinglePhotoView
          photo={openedPhoto}
          onClose={() => setOpenedPhoto(undefined)}
        />
      )}
    </>
  );
}
