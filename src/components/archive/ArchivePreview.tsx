import {
  EyeOff,
  Grid2X2,
  MoveHorizontal,
  Play,
  Search,
  Settings2,
  Upload,
} from "lucide-react";
import { motion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type WheelEvent,
} from "react";
import type { MediaQueueItem } from "../../features/media/mediaQueue";
import {
  getClosestRibbonIndex,
  getGridMetrics,
  getGridWindow,
  getRibbonMetrics,
  getRibbonWindow,
} from "../../features/media/virtualMediaLayout";
import { preloadMediaItems } from "../../features/media/mediaPreload";
import { extendSessionMediaOrder } from "../../features/media/sessionMediaOrder";
import { ArchiveMediaCard } from "./ArchiveMediaCard";

export type ArchiveViewMode = "ribbon" | "grid";

type ArchivePreviewProps = {
  items: MediaQueueItem[];
  selectedId?: string;
  hiddenCount: number;
  viewMode: ArchiveViewMode;
  hasFilters: boolean;
  isImporting: boolean;
  onSelect: (mediaId: string) => void;
  onMediaUnavailable: (mediaId: string) => void;
  onImport: () => void;
  onOpenFilters: () => void;
  onOpenSettings: () => void;
  onViewModeChange: (mode: ArchiveViewMode) => void;
  onStartSlideshow: () => void;
};

type ViewportSize = {
  width: number;
  height: number;
};

const SCROLL_SETTLE_DELAY_MS = 180;

export function ArchivePreview({
  items,
  selectedId,
  hiddenCount,
  viewMode,
  hasFilters,
  isImporting,
  onSelect,
  onMediaUnavailable,
  onImport,
  onOpenFilters,
  onOpenSettings,
  onViewModeChange,
  onStartSlideshow,
}: ArchivePreviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number>();
  const scrollRestoreFrame = useRef<number>();
  const wheelFrame = useRef<number>();
  const scrollSettleTimer = useRef<number>();
  const wheelTarget = useRef(0);
  const wheelDeadline = useRef(0);
  const activeViewMode = useRef(viewMode);
  const pendingViewMode = useRef<ArchiveViewMode>();
  const scrollPositions = useRef<Record<ArchiveViewMode, number>>({
    ribbon: 0,
    grid: 0,
  });
  const sessionOrders = useRef<Record<ArchiveViewMode, string[]>>({
    ribbon: [],
    grid: [],
  });
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  if (activeViewMode.current !== viewMode) {
    pendingViewMode.current = viewMode;
  }
  const [viewport, setViewport] = useState<ViewportSize>(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height:
      typeof window === "undefined"
        ? 720
        : Math.max(320, window.innerHeight - 192),
  }));
  const currentIds = items.map((item) => item.media.id);
  sessionOrders.current.ribbon = extendSessionMediaOrder(
    sessionOrders.current.ribbon,
    currentIds,
  );
  sessionOrders.current.grid = extendSessionMediaOrder(
    sessionOrders.current.grid,
    currentIds,
  );
  const orderedItems = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.media.id, item]));
    return sessionOrders.current[viewMode]
      .map((id) => itemById.get(id))
      .filter((item): item is MediaQueueItem => Boolean(item));
  }, [items, viewMode]);
  const selectedIndex = Math.max(
    0,
    orderedItems.findIndex((item) => item.media.id === selectedId),
  );
  const aspects = useMemo(
    () =>
      orderedItems.map(({ media }) =>
        media.width && media.height ? media.width / media.height : 0.78,
      ),
    [orderedItems],
  );
  const ribbonMetrics = useMemo(
    () => getRibbonMetrics(aspects, viewport.width, viewport.height),
    [aspects, viewport],
  );
  const gridMetrics = useMemo(
    () => getGridMetrics(orderedItems.length, viewport.width, viewport.height),
    [orderedItems.length, viewport],
  );
  const visibleLayouts = useMemo(
    () =>
      viewMode === "grid"
        ? getGridWindow(orderedItems.length, scrollOffset, gridMetrics)
        : getRibbonWindow(ribbonMetrics.layouts, scrollOffset, viewport.width),
    [
      gridMetrics,
      orderedItems.length,
      ribbonMetrics.layouts,
      scrollOffset,
      viewMode,
      viewport.width,
    ],
  );
  const compatibilityPreviewMediaIds = useMemo(() => {
    if (isScrolling) return new Set<string>();
    const visibleIndexes = visibleLayouts
      .filter((layout) =>
        viewMode === "grid"
          ? layout.top + layout.height > scrollOffset &&
            layout.top < scrollOffset + viewport.height
          : layout.left + layout.width > scrollOffset &&
            layout.left < scrollOffset + viewport.width,
      )
      .map((layout) => layout.index);
    const lastVisibleIndex = visibleIndexes.length
      ? Math.max(...visibleIndexes)
      : selectedIndex;
    const indexes = new Set(visibleIndexes);
    for (let offset = 1; offset <= 3; offset += 1) {
      const index = lastVisibleIndex + offset;
      if (index < orderedItems.length) indexes.add(index);
    }
    return new Set(
      Array.from(indexes)
        .map((index) => orderedItems[index]?.media.id)
        .filter((id): id is string => Boolean(id)),
    );
  }, [
    isScrolling,
    orderedItems,
    scrollOffset,
    selectedIndex,
    viewMode,
    viewport.height,
    viewport.width,
    visibleLayouts,
  ]);
  const trackStyle = useMemo<CSSProperties>(
    () =>
      viewMode === "grid"
        ? { width: "100%", height: gridMetrics.totalHeight }
        : { width: ribbonMetrics.totalWidth, height: "100%" },
    [gridMetrics.totalHeight, ribbonMetrics.totalWidth, viewMode],
  );

  useEffect(() => {
    if (isScrolling) return;
    preloadMediaItems(
      visibleLayouts
        .map((layout) => orderedItems[layout.index])
        .filter((item): item is MediaQueueItem => Boolean(item)),
    );
  }, [isScrolling, orderedItems, visibleLayouts]);

  useEffect(
    () => () => {
      if (scrollFrame.current) window.cancelAnimationFrame(scrollFrame.current);
      if (scrollRestoreFrame.current) {
        window.cancelAnimationFrame(scrollRestoreFrame.current);
      }
      if (wheelFrame.current) window.cancelAnimationFrame(wheelFrame.current);
      if (scrollSettleTimer.current) {
        window.clearTimeout(scrollSettleTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    const measure = () => {
      setViewport({
        width: scroller.clientWidth || window.innerWidth,
        height:
          scroller.clientHeight || Math.max(320, window.innerHeight - 192),
      });
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (wheelFrame.current) {
      window.cancelAnimationFrame(wheelFrame.current);
      wheelFrame.current = undefined;
    }

    const maximum =
      viewMode === "grid"
        ? Math.max(0, gridMetrics.totalHeight - viewport.height)
        : Math.max(0, ribbonMetrics.totalWidth - viewport.width);
    const restoredOffset = Math.min(maximum, scrollPositions.current[viewMode]);
    activeViewMode.current = viewMode;
    scroller.scrollLeft = viewMode === "ribbon" ? restoredOffset : 0;
    scroller.scrollTop = viewMode === "grid" ? restoredOffset : 0;
    scrollPositions.current[viewMode] = restoredOffset;
    setScrollOffset(restoredOffset);
    setIsScrolling(false);
    wheelTarget.current = viewMode === "ribbon" ? restoredOffset : 0;
    if (scrollSettleTimer.current) {
      window.clearTimeout(scrollSettleTimer.current);
      scrollSettleTimer.current = undefined;
    }
    if (pendingViewMode.current === viewMode) {
      if (scrollRestoreFrame.current) {
        window.cancelAnimationFrame(scrollRestoreFrame.current);
      }
      scrollRestoreFrame.current = window.requestAnimationFrame(() => {
        scrollRestoreFrame.current = window.requestAnimationFrame(() => {
          pendingViewMode.current = undefined;
          scrollRestoreFrame.current = undefined;
        });
      });
    }
  }, [
    gridMetrics.totalHeight,
    ribbonMetrics.totalWidth,
    viewMode,
    viewport.height,
    viewport.width,
  ]);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const currentViewMode = activeViewMode.current;
    const nextOffset =
      currentViewMode === "grid" ? scroller.scrollTop : scroller.scrollLeft;
    if (pendingViewMode.current) {
      const restoredOffset = scrollPositions.current[currentViewMode];
      if (Math.abs(nextOffset - restoredOffset) < 0.5) return;
      pendingViewMode.current = undefined;
    }
    scrollPositions.current[currentViewMode] = nextOffset;
    if (currentViewMode === "ribbon" && !wheelFrame.current) {
      wheelTarget.current = nextOffset;
    }

    setIsScrolling(true);
    if (scrollSettleTimer.current) {
      window.clearTimeout(scrollSettleTimer.current);
    }
    const settleScroll = () => {
      if (
        wheelFrame.current &&
        window.performance.now() < wheelDeadline.current
      ) {
        scrollSettleTimer.current = window.setTimeout(settleScroll, 40);
        return;
      }
      const scroller = scrollerRef.current;
      if (wheelFrame.current) {
        window.cancelAnimationFrame(wheelFrame.current);
        wheelFrame.current = undefined;
        if (scroller && viewMode === "ribbon") {
          scroller.scrollLeft = wheelTarget.current;
          scrollPositions.current.ribbon = wheelTarget.current;
          setScrollOffset(wheelTarget.current);
        }
      }
      setIsScrolling(false);
      scrollSettleTimer.current = undefined;
      if (
        !scroller ||
        viewMode !== "ribbon" ||
        activeViewMode.current !== viewMode ||
        !orderedItems.length
      ) {
        return;
      }

      const nextIndex = getClosestRibbonIndex(
        ribbonMetrics.layouts,
        scroller.scrollLeft + scroller.clientWidth / 2,
      );
      const nextItem = orderedItems[nextIndex];
      if (nextItem && nextItem.media.id !== selectedId) {
        onSelect(nextItem.media.id);
      }
    };
    scrollSettleTimer.current = window.setTimeout(
      settleScroll,
      SCROLL_SETTLE_DELAY_MS,
    );

    if (scrollFrame.current) window.cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = window.requestAnimationFrame(() => {
      setScrollOffset(nextOffset);
    });
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (viewMode !== "ribbon") return;
    const dominantDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!dominantDelta) return;

    event.preventDefault();
    const scroller = event.currentTarget;
    const unit =
      event.deltaMode === 1
        ? 24
        : event.deltaMode === 2
          ? Math.max(320, scroller.clientWidth)
          : 1;
    const maximum = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const currentTarget = wheelFrame.current
      ? wheelTarget.current
      : scroller.scrollLeft;
    wheelTarget.current = Math.min(
      maximum,
      Math.max(0, currentTarget + dominantDelta * unit * 1.05),
    );
    wheelDeadline.current = window.performance.now() + 1_500;

    if (wheelFrame.current) return;
    const animate = () => {
      const currentScroller = scrollerRef.current;
      if (!currentScroller || viewMode !== "ribbon") {
        wheelFrame.current = undefined;
        return;
      }

      const distance = wheelTarget.current - currentScroller.scrollLeft;
      if (Math.abs(distance) < 0.5) {
        currentScroller.scrollLeft = wheelTarget.current;
        wheelFrame.current = undefined;
        return;
      }

      currentScroller.scrollLeft += distance * 0.2;
      wheelFrame.current = window.requestAnimationFrame(animate);
    };
    wheelFrame.current = window.requestAnimationFrame(animate);
  }

  function handleViewModeChange(nextViewMode: ArchiveViewMode) {
    if (nextViewMode === viewMode) return;
    pendingViewMode.current = nextViewMode;
    const scroller = scrollerRef.current;
    if (scroller) {
      const currentOffset =
        viewMode === "grid" ? scroller.scrollTop : scroller.scrollLeft;
      scrollPositions.current[viewMode] = currentOffset;
      if (viewMode === "ribbon") wheelTarget.current = currentOffset;
    }
    if (wheelFrame.current) {
      window.cancelAnimationFrame(wheelFrame.current);
      wheelFrame.current = undefined;
    }
    if (scrollSettleTimer.current) {
      window.clearTimeout(scrollSettleTimer.current);
      scrollSettleTimer.current = undefined;
    }
    onViewModeChange(nextViewMode);
  }

  return (
    <section className={`archive-preview is-${viewMode}`}>
      <header className="archive-header">
        <div className="archive-logo">
          <strong>Instagram Viewer</strong>
        </div>
        <div className="archive-view-tabs" aria-label="Photo layout">
          <button
            className={`viewer-control${viewMode === "ribbon" ? " is-active" : ""}`}
            type="button"
            aria-pressed={viewMode === "ribbon"}
            onClick={() => handleViewModeChange("ribbon")}
          >
            <MoveHorizontal size={22} aria-hidden="true" /> Horizontal View
          </button>
          <button
            className={`viewer-control${viewMode === "grid" ? " is-active" : ""}`}
            type="button"
            aria-pressed={viewMode === "grid"}
            onClick={() => handleViewModeChange("grid")}
          >
            <Grid2X2 size={21} aria-hidden="true" /> Grid View
          </button>
        </div>
        <button
          className="viewer-control archive-import-link"
          type="button"
          onClick={onImport}
        >
          <Upload size={18} aria-hidden="true" />
          {isImporting ? "Importing…" : "Import JSON"}
        </button>
      </header>

      <div
        ref={scrollerRef}
        className="archive-scroller"
        data-testid="archive-scroller"
        data-rendered-count={visibleLayouts.length}
        data-scroll-state={isScrolling ? "moving" : "settled"}
        onWheel={handleWheel}
        onScroll={handleScroll}
      >
        <div className="archive-track" style={trackStyle}>
          {orderedItems.length ? (
            visibleLayouts.map((layout) => {
              const item = orderedItems[layout.index];
              return (
                <ArchiveMediaCard
                  key={item.media.id}
                  item={item}
                  index={layout.index}
                  selected={item.media.id === selectedId}
                  loadMedia={!isScrolling}
                  allowCompatibilityPreview={compatibilityPreviewMediaIds.has(
                    item.media.id,
                  )}
                  layoutStyle={{
                    position: "absolute",
                    left: layout.left,
                    top: layout.top,
                    width: layout.width,
                    height: layout.height,
                  }}
                  onSelect={() => onSelect(item.media.id)}
                  onUnavailable={() => onMediaUnavailable(item.media.id)}
                />
              );
            })
          ) : hasFilters ? (
            <div className="archive-empty-field">
              <strong>No photos match.</strong>
              <span>Open Filter and clear the current search.</span>
            </div>
          ) : null}
        </div>
      </div>

      <motion.div
        className="archive-dock"
        initial={{ y: "110%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="dock-actions">
          <button
            className={`viewer-control${hasFilters ? " is-active" : ""}`}
            type="button"
            onClick={onOpenFilters}
          >
            <Search size={18} aria-hidden="true" /> Filter
          </button>
          <button
            className="viewer-control"
            type="button"
            onClick={onOpenSettings}
          >
            {hiddenCount ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Settings2 size={18} aria-hidden="true" />
            )}
            Settings
          </button>
          <button
            className="viewer-control dock-play"
            type="button"
            disabled={items.length === 0}
            onClick={onStartSlideshow}
          >
            Slideshow <Play size={16} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </section>
  );
}
