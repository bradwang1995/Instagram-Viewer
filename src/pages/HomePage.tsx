import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArchiveTab } from "../components/archive/ArchiveChrome";
import { ArchiveLanding } from "../components/archive/ArchiveLanding";
import {
  ArchivePreview,
  type ArchiveViewMode,
} from "../components/archive/ArchivePreview";
import { ArchiveSlideshow } from "../components/archive/ArchiveSlideshow";
import { getSettings, updateSettings } from "../db/settingsRepository";
import { DEFAULT_SETTINGS, type TransitionPreset } from "../db/schema";
import { importSavedPostsJsonFile } from "../features/import/importJson";
import {
  filterMediaQueue,
  type MediaQueueItem,
} from "../features/media/mediaQueue";
import { preloadMediaItems } from "../features/media/mediaPreload";
import { useMediaLibrary } from "../hooks/useMediaLibrary";

function getViewModeFromUrl(): ArchiveViewMode {
  return new URLSearchParams(window.location.search).get("view") === "grid"
    ? "grid"
    : "ribbon";
}

function getViewModeParam(viewMode: ArchiveViewMode): string {
  return viewMode === "grid" ? "grid" : "horizontal";
}

function getMonthStart(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function formatDateInput(value: number, endOfMonth = false): string {
  const date = new Date(value);
  if (endOfMonth) {
    date.setMonth(date.getMonth() + 1, 0);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function HomePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { posts, queue, isLoading, error, refresh } = useMediaLibrary();
  const [selectedMediaId, setSelectedMediaId] = useState<string>();
  const [viewMode, setViewMode] = useState<ArchiveViewMode>(getViewModeFromUrl);
  const [isSlideshowOpen, setIsSlideshowOpen] = useState(() =>
    new URLSearchParams(window.location.search).has("slideshow"),
  );
  const [dwellMs, setDwellMs] = useState(DEFAULT_SETTINGS.slideshowIntervalMs);
  const [transitionPreset, setTransitionPreset] = useState<TransitionPreset>(
    DEFAULT_SETTINGS.slideshowTransitionPreset,
  );
  const [dateStartMonth, setDateStartMonth] = useState<number>();
  const [dateEndMonth, setDateEndMonth] = useState<number>();
  const [isImporting, setIsImporting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [landingDismissed, setLandingDismissed] = useState(false);
  const [unavailableMediaIds, setUnavailableMediaIds] = useState<Set<string>>(
    () => new Set(),
  );

  const forceLanding = useMemo(
    () => new URLSearchParams(window.location.search).has("landing"),
    [],
  );

  const setViewModeRoute = useCallback((mode: ArchiveViewMode) => {
    const url = new URL(window.location.href);
    const nextView = getViewModeParam(mode);
    if (url.searchParams.get("view") !== nextView) {
      url.searchParams.set("view", nextView);
      window.history.pushState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    setViewMode(mode);
  }, []);

  const setSlideshowRoute = useCallback((open: boolean, replace = false) => {
    const url = new URL(window.location.href);
    if (open) url.searchParams.set("slideshow", "1");
    else url.searchParams.delete("slideshow");
    window.history[replace ? "replaceState" : "pushState"](
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setIsSlideshowOpen(open);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const initialView = getViewModeFromUrl();
    const initialViewParam = getViewModeParam(initialView);
    if (url.searchParams.get("view") !== initialViewParam) {
      url.searchParams.set("view", initialViewParam);
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }

    const handleHistoryChange = () => {
      const open = new URLSearchParams(window.location.search).has("slideshow");
      setViewMode(getViewModeFromUrl());
      setIsSlideshowOpen(open);
    };
    window.addEventListener("popstate", handleHistoryChange);
    return () => window.removeEventListener("popstate", handleHistoryChange);
  }, []);

  useEffect(() => {
    void getSettings().then((settings) => {
      setDwellMs(
        Math.min(10_000, Math.max(1_000, settings.slideshowIntervalMs)),
      );
      setTransitionPreset(settings.slideshowTransitionPreset);
    });
  }, []);

  const sessionItems = useMemo(
    () => queue.filter((item) => !unavailableMediaIds.has(item.media.id)),
    [queue, unavailableMediaIds],
  );
  const dateMonths = useMemo(
    () =>
      Array.from(
        new Set(
          sessionItems
            .map((item) =>
              getMonthStart(item.post.savedAt ?? item.post.importedAt),
            )
            .filter((value): value is number => value !== undefined),
        ),
      ).sort((a, b) => a - b),
    [sessionItems],
  );
  const startMonthCandidate =
    dateStartMonth === undefined
      ? 0
      : dateMonths.findIndex((month) => month >= dateStartMonth);
  const dateStartIndex =
    startMonthCandidate < 0
      ? Math.max(0, dateMonths.length - 1)
      : startMonthCandidate;
  const endMonthCandidate =
    dateEndMonth === undefined
      ? dateMonths.length - 1
      : dateMonths.reduce(
          (foundIndex, month, index) =>
            month <= dateEndMonth ? index : foundIndex,
          -1,
        );
  const dateEndIndex = Math.max(dateStartIndex, endMonthCandidate);
  const dateFrom = dateMonths[dateStartIndex]
    ? formatDateInput(dateMonths[dateStartIndex])
    : "";
  const dateTo = dateMonths[dateEndIndex]
    ? formatDateInput(dateMonths[dateEndIndex], true)
    : "";
  const visibleItems = useMemo(
    () =>
      filterMediaQueue(queue, {
        query: "",
        creator: "",
        collection: "",
        dateFrom,
        dateTo,
        includeHidden: true,
      }).filter((item) => !unavailableMediaIds.has(item.media.id)),
    [dateFrom, dateTo, queue, unavailableMediaIds],
  );
  const visibleItemIds = useMemo(
    () => new Set(visibleItems.map((item) => item.media.id)),
    [visibleItems],
  );
  const selectedIndex = Math.max(
    0,
    visibleItems.findIndex((item) => item.media.id === selectedMediaId),
  );
  const selectedItem =
    visibleItems.find((item) => item.media.id === selectedMediaId) ??
    visibleItems[0];
  const hasFilters =
    dateStartIndex > 0 || dateEndIndex < Math.max(0, dateMonths.length - 1);
  const dateRange = useMemo(
    () => ({
      months: dateMonths,
      startIndex: dateStartIndex,
      endIndex: dateEndIndex,
      onStartChange: (index: number) => {
        setDateStartMonth(dateMonths[index]);
      },
      onEndChange: (index: number) => {
        setDateEndMonth(dateMonths[index]);
      },
    }),
    [dateEndIndex, dateMonths, dateStartIndex],
  );
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
      return;
    }
    if (selectedMediaId !== selectedItem.media.id) {
      setSelectedMediaId(selectedItem.media.id);
    }
  }, [selectedItem, selectedMediaId]);

  const move = useCallback(
    (direction: 1 | -1) => {
      if (!selectedItem || visibleItems.length < 2) return;

      const currentIndex = visibleItems.findIndex(
        (item) => item.media.id === selectedItem.media.id,
      );
      const targetIndex =
        (currentIndex + direction + visibleItems.length) % visibleItems.length;
      setSelectedMediaId(visibleItems[targetIndex].media.id);
    },
    [selectedItem, visibleItems],
  );

  useEffect(() => {
    if (!isSlideshowOpen || visibleItems.length < 2) {
      return undefined;
    }
    const timer = window.setTimeout(() => move(1), dwellMs);
    return () => window.clearTimeout(timer);
  }, [
    dwellMs,
    isSlideshowOpen,
    move,
    selectedItem?.media.id,
    visibleItems.length,
  ]);

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

  const closeSlideshow = useCallback(() => {
    setSlideshowRoute(false, true);
  }, [setSlideshowRoute]);

  const openSlideshow = useCallback(() => {
    setSlideshowRoute(true);
  }, [setSlideshowRoute]);

  const omitUnavailableMedia = useCallback(
    (mediaId: string) => {
      const currentIndex = visibleItems.findIndex(
        (item) => item.media.id === mediaId,
      );
      const next =
        visibleItems.length > 1 && currentIndex >= 0
          ? visibleItems[(currentIndex + 1) % visibleItems.length]
          : undefined;

      if (selectedMediaId === mediaId) {
        setSelectedMediaId(next?.media.id);
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
    },
    [closeSlideshow, selectedMediaId, visibleItems],
  );

  function persistPlayback(patch: Parameters<typeof updateSettings>[0]) {
    void updateSettings(patch).catch(() => {
      setActionError("Playback preferences could not be saved locally.");
    });
  }

  const handleArchiveSelect = useCallback((mediaId: string) => {
    setSelectedMediaId(mediaId);
  }, []);
  const requestArchiveImport = useCallback(
    () => fileInputRef.current?.click(),
    [],
  );
  const handleTabChange = useCallback(
    (tab: ArchiveTab) => {
      if (tab === "slideshow") {
        openSlideshow();
        return;
      }
      if (isSlideshowOpen) closeSlideshow();
      setViewModeRoute(tab);
    },
    [closeSlideshow, isSlideshowOpen, openSlideshow, setViewModeRoute],
  );

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
          items={sessionItems}
          visibleItemIds={visibleItemIds}
          selectedId={selectedItem?.media.id}
          viewMode={viewMode}
          hasFilters={hasFilters}
          dateRange={dateRange}
          isImporting={isImporting}
          onSelect={handleArchiveSelect}
          onMediaUnavailable={omitUnavailableMedia}
          onImport={requestArchiveImport}
          onViewModeChange={setViewModeRoute}
          onStartSlideshow={openSlideshow}
        />
      ) : null}

      <AnimatePresence>
        {isSlideshowOpen ? (
          <ArchiveSlideshow
            open
            item={selectedItem}
            dwellMs={dwellMs}
            transitionPreset={transitionPreset}
            dateRange={dateRange}
            isImporting={isImporting}
            onPrevious={() => move(-1)}
            onNext={() => move(1)}
            onTabChange={handleTabChange}
            onImport={requestArchiveImport}
            onDwellChange={(value) => {
              setDwellMs(value);
              persistPlayback({ slideshowIntervalMs: value });
            }}
            onTransitionPresetChange={(value) => {
              setTransitionPreset(value);
              persistPlayback({ slideshowTransitionPreset: value });
            }}
            onUnavailable={() =>
              selectedItem && omitUnavailableMedia(selectedItem.media.id)
            }
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
