import { EyeOff, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArchiveLanding } from "../components/archive/ArchiveLanding";
import {
  ArchiveFilterSheet,
  ArchiveSettingsSheet,
} from "../components/archive/ArchiveSheets";
import {
  ArchivePreview,
  type ArchiveViewMode,
} from "../components/archive/ArchivePreview";
import { ArchiveSlideshow } from "../components/archive/ArchiveSlideshow";
import { restoreAllMedia, setMediaVisibility } from "../db/mediaRepository";
import { getSettings, updateSettings } from "../db/settingsRepository";
import { DEFAULT_SETTINGS, type TransitionPreset } from "../db/schema";
import { importSavedPostsJsonFile } from "../features/import/importJson";
import {
  filterMediaQueue,
  type MediaQueueItem,
} from "../features/media/mediaQueue";
import { preloadMediaItems } from "../features/media/mediaPreload";
import { useMediaLibrary } from "../hooks/useMediaLibrary";

export function HomePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { posts, queue, isLoading, error, refresh } = useMediaLibrary();
  const [selectedMediaId, setSelectedMediaId] = useState<string>();
  const [viewMode, setViewMode] = useState<ArchiveViewMode>(() =>
    new URLSearchParams(window.location.search).get("view") === "grid"
      ? "grid"
      : "ribbon",
  );
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState("");
  const [collection, setCollection] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(() =>
    new URLSearchParams(window.location.search).has("slideshow"),
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [dwellMs, setDwellMs] = useState(DEFAULT_SETTINGS.slideshowIntervalMs);
  const [transitionDurationMs, setTransitionDurationMs] = useState(
    DEFAULT_SETTINGS.slideshowTransitionDurationMs,
  );
  const [transitionPreset, setTransitionPreset] = useState<TransitionPreset>(
    DEFAULT_SETTINGS.slideshowTransitionPreset,
  );
  const [loopMode, setLoopMode] = useState(DEFAULT_SETTINGS.slideshowLoopMode);
  const [isImporting, setIsImporting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [undoItem, setUndoItem] = useState<MediaQueueItem>();
  const [landingDismissed, setLandingDismissed] = useState(false);
  const [unavailableMediaIds, setUnavailableMediaIds] = useState<Set<string>>(
    () => new Set(),
  );

  const forceLanding = useMemo(
    () => new URLSearchParams(window.location.search).has("landing"),
    [],
  );

  const setSlideshowRoute = useCallback(
    (open: boolean, replace = false) => {
      const url = new URL(window.location.href);
      if (open) url.searchParams.set("slideshow", "1");
      else url.searchParams.delete("slideshow");
      window.history[replace ? "replaceState" : "pushState"](
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      setIsSlideshowOpen(open);
    },
    [],
  );

  useEffect(() => {
    const handleHistoryChange = () => {
      const open = new URLSearchParams(window.location.search).has(
        "slideshow",
      );
      setIsSlideshowOpen(open);
      setIsPlaying(open);
      setElapsedMs(0);
    };
    window.addEventListener("popstate", handleHistoryChange);
    return () => window.removeEventListener("popstate", handleHistoryChange);
  }, []);

  useEffect(() => {
    if (isSlideshowOpen) return;
    setIsPlaying(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [isSlideshowOpen]);

  useEffect(() => {
    void getSettings().then((settings) => {
      setDwellMs(settings.slideshowIntervalMs);
      setTransitionDurationMs(settings.slideshowTransitionDurationMs);
      setTransitionPreset(settings.slideshowTransitionPreset);
      setLoopMode(settings.slideshowLoopMode);
    });
  }, []);

  const creators = useMemo(
    () =>
      Array.from(
        new Set(
          queue
            .filter((item) => !unavailableMediaIds.has(item.media.id))
            .map(
              (item) => item.media.creatorHandle ?? item.post.embedAuthorName,
            )
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [queue, unavailableMediaIds],
  );
  const collections = useMemo(
    () =>
      Array.from(new Set(posts.flatMap((post) => post.collectionNames))).sort(),
    [posts],
  );
  const hiddenItems = useMemo(
    () => queue.filter((item) => item.preference?.visibility === "hidden"),
    [queue],
  );
  const visibleItems = useMemo(
    () =>
      filterMediaQueue(queue, {
        query,
        creator,
        collection,
        dateFrom: "",
        dateTo: "",
        includeHidden: false,
      }).filter((item) => !unavailableMediaIds.has(item.media.id)),
    [collection, creator, query, queue, unavailableMediaIds],
  );
  const selectedIndex = Math.max(
    0,
    visibleItems.findIndex((item) => item.media.id === selectedMediaId),
  );
  const selectedItem =
    visibleItems.find((item) => item.media.id === selectedMediaId) ??
    visibleItems[0];
  const hasFilters = Boolean(query || creator || collection);
  const showLanding =
    !isLoading && (posts.length === 0 || (forceLanding && !landingDismissed));

  useEffect(() => {
    if (!visibleItems.length) return;
    const preloadOffsets = [-2, -1, 1, 2, 3, 4];
    preloadMediaItems(
      preloadOffsets
        .map(
          (offset) =>
            visibleItems[
              (selectedIndex + offset + visibleItems.length) %
                visibleItems.length
            ],
        )
        .filter((item): item is MediaQueueItem => Boolean(item)),
    );
  }, [selectedIndex, visibleItems]);

  useEffect(() => {
    if (!selectedItem) {
      setSelectedMediaId(undefined);
      setIsPlaying(false);
      return;
    }
    if (selectedMediaId !== selectedItem.media.id) {
      setSelectedMediaId(selectedItem.media.id);
    }
  }, [selectedItem, selectedMediaId]);

  const move = useCallback(
    (direction: 1 | -1) => {
      if (!selectedItem || visibleItems.length < 2) return;

      if (loopMode === "source-post") {
        const sourceItems = visibleItems.filter(
          (item) => item.post.id === selectedItem.post.id,
        );
        const sourceIndex = sourceItems.findIndex(
          (item) => item.media.id === selectedItem.media.id,
        );
        const target =
          sourceItems[
            (sourceIndex + direction + sourceItems.length) % sourceItems.length
          ];
        setSelectedMediaId(target.media.id);
        setElapsedMs(0);
        return;
      }

      const currentIndex = visibleItems.findIndex(
        (item) => item.media.id === selectedItem.media.id,
      );
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= visibleItems.length) {
        if (loopMode === "off") {
          setIsPlaying(false);
          return;
        }
        setSelectedMediaId(
          visibleItems[
            (targetIndex + visibleItems.length) % visibleItems.length
          ].media.id,
        );
      } else {
        setSelectedMediaId(visibleItems[targetIndex].media.id);
      }
      setElapsedMs(0);
    },
    [loopMode, selectedItem, visibleItems],
  );

  useEffect(() => {
    setElapsedMs(0);
    if (!isSlideshowOpen || !isPlaying || visibleItems.length < 2) {
      return undefined;
    }
    let startedAt = Date.now();
    const timer = window.setInterval(() => {
      const nextElapsed = Date.now() - startedAt;
      if (nextElapsed >= dwellMs) {
        startedAt = Date.now();
        setElapsedMs(0);
        move(1);
      } else {
        setElapsedMs(nextElapsed);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [
    dwellMs,
    isPlaying,
    isSlideshowOpen,
    move,
    selectedItem?.media.id,
    visibleItems.length,
  ]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        if (event.key !== "Escape") return;
      }

      if (event.key === "Escape") {
        if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isFilterOpen) setIsFilterOpen(false);
        else if (isSlideshowOpen) {
          closeSlideshow();
        }
      }
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === " " && isSlideshowOpen) {
        event.preventDefault();
        setIsPlaying((value) => !value);
      }
      if (event.key.toLowerCase() === "h" && selectedItem) {
        void hideMedia(selectedItem);
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  });

  async function handleImport(file?: File) {
    if (!file) return;
    setIsImporting(true);
    setActionError("");
    const job = await importSavedPostsJsonFile(file);
    setIsImporting(false);
    if (job.status === "completed") {
      await refresh();
      setUnavailableMediaIds(new Set());
      setSelectedMediaId(undefined);
      setLandingDismissed(true);
      if (forceLanding) {
        window.history.replaceState({}, "", import.meta.env.BASE_URL);
        setIsSlideshowOpen(false);
      }
    } else {
      setActionError(job.error ?? "Could not import this JSON file.");
    }
  }

  async function hideMedia(item: MediaQueueItem) {
    const currentIndex = visibleItems.findIndex(
      (candidate) => candidate.media.id === item.media.id,
    );
    const next =
      visibleItems.length > 1
        ? visibleItems[(currentIndex + 1) % visibleItems.length]
        : undefined;
    if (next) setSelectedMediaId(next.media.id);
    setUndoItem(item);
    await setMediaVisibility(item.media.id, "hidden");
  }

  async function restoreMedia(mediaId: string) {
    await setMediaVisibility(mediaId, "visible");
    if (undoItem?.media.id === mediaId) setUndoItem(undefined);
  }

  async function restoreEverything() {
    await restoreAllMedia();
  }

  function omitUnavailableMedia(mediaId: string) {
    const currentIndex = visibleItems.findIndex(
      (item) => item.media.id === mediaId,
    );
    const next =
      visibleItems.length > 1 && currentIndex >= 0
        ? visibleItems[(currentIndex + 1) % visibleItems.length]
        : undefined;

    if (selectedMediaId === mediaId) {
      setSelectedMediaId(next?.media.id);
      setElapsedMs(0);
      if (!next) {
        closeSlideshow();
      }
    }
    setUnavailableMediaIds((current) => {
      if (current.has(mediaId)) return current;
      const nextIds = new Set(current);
      nextIds.add(mediaId);
      return nextIds;
    });
  }

  function persistPlayback(patch: Parameters<typeof updateSettings>[0]) {
    void updateSettings(patch).catch(() => {
      setActionError("Playback preferences could not be saved locally.");
    });
  }

  function openSlideshow() {
    setSlideshowRoute(true);
    setIsPlaying(true);
    setElapsedMs(0);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }

  function closeSlideshow() {
    setSlideshowRoute(false, true);
    setIsPlaying(false);
  }

  return (
    <div className="archive-app">
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          void handleImport(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {isLoading ? (
        <div className="archive-loading">
          <span>Instagram Viewer</span>
          <strong>Opening your photos…</strong>
        </div>
      ) : null}

      {showLanding ? (
        <ArchiveLanding
          isImporting={isImporting}
          error={actionError || error}
          onChooseFile={() => fileInputRef.current?.click()}
          onFile={(file) => void handleImport(file)}
          onDemo={() => {
            window.location.search = "?demo=1";
          }}
        />
      ) : null}

      {!isLoading && !showLanding ? (
        <ArchivePreview
          items={visibleItems}
          selectedId={selectedItem?.media.id}
          hiddenCount={hiddenItems.length}
          viewMode={viewMode}
          hasFilters={hasFilters}
          isImporting={isImporting}
          onSelect={(mediaId) => {
            setSelectedMediaId(mediaId);
            setElapsedMs(0);
          }}
          onMediaUnavailable={omitUnavailableMedia}
          onImport={() => fileInputRef.current?.click()}
          onOpenFilters={() => setIsFilterOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onViewModeChange={setViewMode}
          onStartSlideshow={openSlideshow}
        />
      ) : null}

      <ArchiveFilterSheet
        open={isFilterOpen}
        query={query}
        creator={creator}
        collection={collection}
        creators={creators}
        collections={collections}
        onQueryChange={setQuery}
        onCreatorChange={setCreator}
        onCollectionChange={setCollection}
        onClear={() => {
          setQuery("");
          setCreator("");
          setCollection("");
        }}
        onClose={() => setIsFilterOpen(false)}
      />

      <ArchiveSettingsSheet
        open={isSettingsOpen}
        dwellMs={dwellMs}
        transitionDurationMs={transitionDurationMs}
        transitionPreset={transitionPreset}
        loopMode={loopMode}
        hiddenItems={hiddenItems}
        onDwellChange={(value) => {
          setDwellMs(value);
          persistPlayback({ slideshowIntervalMs: value });
        }}
        onTransitionDurationChange={(value) => {
          setTransitionDurationMs(value);
          persistPlayback({ slideshowTransitionDurationMs: value });
        }}
        onTransitionPresetChange={(value) => {
          setTransitionPreset(value);
          persistPlayback({ slideshowTransitionPreset: value });
        }}
        onLoopModeChange={(value) => {
          setLoopMode(value);
          persistPlayback({ slideshowLoopMode: value });
        }}
        onRestore={(id) => void restoreMedia(id)}
        onRestoreAll={() => void restoreEverything()}
        onClose={() => setIsSettingsOpen(false)}
      />

      <AnimatePresence>
        {isSlideshowOpen ? (
          <ArchiveSlideshow
            open
            item={selectedItem}
            index={selectedIndex}
            total={visibleItems.length}
            isPlaying={isPlaying}
            elapsedMs={elapsedMs}
            dwellMs={dwellMs}
            transitionDurationMs={transitionDurationMs}
            transitionPreset={transitionPreset}
            onPrevious={() => move(-1)}
            onNext={() => move(1)}
            onTogglePlaying={() => setIsPlaying((value) => !value)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onHide={() => selectedItem && void hideMedia(selectedItem)}
            onUnavailable={() =>
              selectedItem && omitUnavailableMedia(selectedItem.media.id)
            }
            onClose={closeSlideshow}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {undoItem ? (
          <motion.div
            className="archive-undo"
            role="status"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
          >
            <EyeOff size={16} aria-hidden="true" />
            <span>Frame hidden from future sessions.</span>
            <button
              type="button"
              onClick={() => void restoreMedia(undoItem.media.id)}
            >
              <RotateCcw size={14} aria-hidden="true" /> Undo
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setUndoItem(undefined)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
