import { motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type WheelEvent,
} from "react";
import type { MediaQueueItem } from "../../features/media/mediaQueue";
import {
  getClosestRibbonIndex,
  getGridLayouts,
  getGridMetrics,
  getRibbonMetrics,
} from "../../features/media/virtualMediaLayout";
import { preloadMediaItems } from "../../features/media/mediaPreload";
import {
  addWheelImpulse,
  advanceMomentum,
} from "../../features/media/scrollMomentum";
import { extendSessionMediaOrder } from "../../features/media/sessionMediaOrder";
import {
  ArchiveControlBar,
  type ArchiveDateRange,
  ArchiveHeader,
} from "./ArchiveChrome";
import { ArchiveMediaCard, type IframeStatus } from "./ArchiveMediaCard";

export type ArchiveViewMode = "ribbon" | "grid";

type ArchivePreviewProps = {
  items: MediaQueueItem[];
  visibleItemIds: ReadonlySet<string>;
  selectedId?: string;
  viewMode: ArchiveViewMode;
  hasFilters: boolean;
  dateRange: ArchiveDateRange;
  isImporting: boolean;
  onSelect: (mediaId: string) => void;
  onMediaUnavailable: (mediaId: string) => void;
  onImport: () => void;
  onViewModeChange: (mode: ArchiveViewMode) => void;
  onStartSlideshow: () => void;
};

type ViewportSize = {
  width: number;
  height: number;
};

const SCROLL_SETTLE_DELAY_MS = 180;
const PRELOAD_AHEAD_VIEWPORTS = 1;
const HIDDEN_CARD_STYLE: CSSProperties = { display: "none" };
const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
export const MAX_RETAINED_INSTAGRAM_IFRAMES = Infinity;

export const ArchivePreview = memo(function ArchivePreview({
  items,
  visibleItemIds,
  selectedId,
  viewMode,
  hasFilters,
  dateRange,
  isImporting,
  onSelect,
  onMediaUnavailable,
  onImport,
  onViewModeChange,
  onStartSlideshow,
}: ArchivePreviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number>();
  const scrollRestoreFrame = useRef<number>();
  const wheelFrame = useRef<number>();
  const scrollSettleTimer = useRef<number>();
  const iframeObserverRef = useRef<IntersectionObserver>();
  const cardShellsRef = useRef(new Map<string, HTMLElement>());
  const activatedIframeIdsRef = useRef(new Set<string>());
  const iframeStatusByIdRef = useRef(new Map<string, IframeStatus>());
  const wheelVelocity = useRef(0);
  const wheelLastFrameTime = useRef<number>();
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
  const [, setIframeStateRevision] = useState(0);
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
  const visibleOrderedItems = useMemo(
    () => orderedItems.filter((item) => visibleItemIds.has(item.media.id)),
    [orderedItems, visibleItemIds],
  );
  const visibleIndexById = useMemo(
    () =>
      new Map(visibleOrderedItems.map((item, index) => [item.media.id, index])),
    [visibleOrderedItems],
  );
  const aspects = useMemo(
    () =>
      visibleOrderedItems.map(({ media }) =>
        media.width && media.height ? media.width / media.height : 0.78,
      ),
    [visibleOrderedItems],
  );
  const ribbonMetrics = useMemo(
    () => getRibbonMetrics(aspects, viewport.width, viewport.height),
    [aspects, viewport],
  );
  const gridMetrics = useMemo(
    () =>
      getGridMetrics(
        visibleOrderedItems.length,
        viewport.width,
        viewport.height,
      ),
    [visibleOrderedItems.length, viewport],
  );
  const allLayouts = useMemo(
    () =>
      viewMode === "grid"
        ? getGridLayouts(visibleOrderedItems.length, gridMetrics)
        : ribbonMetrics.layouts,
    [gridMetrics, ribbonMetrics.layouts, viewMode, visibleOrderedItems.length],
  );
  const layoutStyleById = useMemo(() => {
    const styles = new Map<string, CSSProperties>();
    allLayouts.forEach((layout) => {
      const item = visibleOrderedItems[layout.index];
      if (!item) return;
      styles.set(item.media.id, {
        position: "absolute",
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
      });
    });
    return styles;
  }, [allLayouts, visibleOrderedItems]);
  const trackStyle = useMemo<CSSProperties>(
    () =>
      viewMode === "grid"
        ? { width: "100%", height: gridMetrics.totalHeight }
        : { width: ribbonMetrics.totalWidth, height: "100%" },
    [gridMetrics.totalHeight, ribbonMetrics.totalWidth, viewMode],
  );

  const activateIframe = useCallback((itemId: string) => {
    if (activatedIframeIdsRef.current.has(itemId)) return;
    activatedIframeIdsRef.current.add(itemId);
    iframeStatusByIdRef.current.set(itemId, "loading");
    setIframeStateRevision((revision) => revision + 1);
  }, []);

  const registerShell = useCallback(
    (itemId: string, node: HTMLElement | null) => {
      const previous = cardShellsRef.current.get(itemId);
      if (previous && previous !== node) {
        iframeObserverRef.current?.unobserve(previous);
      }
      if (!node) {
        cardShellsRef.current.delete(itemId);
        return;
      }
      cardShellsRef.current.set(itemId, node);
      iframeObserverRef.current?.observe(node);
    },
    [],
  );

  const setIframeStatus = useCallback(
    (itemId: string, status: "loaded" | "error") => {
      const current = iframeStatusByIdRef.current.get(itemId);
      if (current === status || current === "loaded") return;
      iframeStatusByIdRef.current.set(itemId, status);
      setIframeStateRevision((revision) => revision + 1);
    },
    [],
  );
  const handleIframeLoad = useCallback(
    (itemId: string) => setIframeStatus(itemId, "loaded"),
    [setIframeStatus],
  );
  const handleIframeError = useCallback(
    (itemId: string) => setIframeStatus(itemId, "error"),
    [setIframeStatus],
  );
  const activatePreloadZone = useCallback(
    (offset: number) => {
      const viewportLength =
        viewMode === "grid" ? viewport.height : viewport.width;
      const preloadEnd =
        offset + viewportLength * (1 + PRELOAD_AHEAD_VIEWPORTS);
      const preloadItems: MediaQueueItem[] = [];

      allLayouts.forEach((layout) => {
        const start = viewMode === "grid" ? layout.top : layout.left;
        const size = viewMode === "grid" ? layout.height : layout.width;
        if (start + size <= offset || start >= preloadEnd) return;
        const item = visibleOrderedItems[layout.index];
        if (!item) return;
        activateIframe(item.media.id);
        preloadItems.push(item);
      });

      preloadMediaItems(preloadItems);
    },
    [
      activateIframe,
      allLayouts,
      viewMode,
      viewport.height,
      viewport.width,
      visibleOrderedItems,
    ],
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const itemId = (entry.target as HTMLElement).dataset.mediaId;
          if (itemId) activateIframe(itemId);
        });
      },
      {
        root: scroller,
        rootMargin:
          viewMode === "grid" ? "0px 0px 100% 0px" : "0px 100% 0px 0px",
        threshold: 0,
      },
    );
    iframeObserverRef.current = observer;
    cardShellsRef.current.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      if (iframeObserverRef.current === observer) {
        iframeObserverRef.current = undefined;
      }
    };
  }, [activateIframe, viewMode]);

  useEffect(() => {
    activatePreloadZone(scrollPositions.current[viewMode]);
  }, [activatePreloadZone, viewMode]);

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
    scroller.dataset.scrollState = "settled";
    wheelVelocity.current = 0;
    wheelLastFrameTime.current = undefined;
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
      wheelVelocity.current = 0;
      wheelLastFrameTime.current = undefined;
    }

    scroller.dataset.scrollState = "moving";
    if (scrollSettleTimer.current) {
      window.clearTimeout(scrollSettleTimer.current);
    }
    const settleScroll = () => {
      if (wheelFrame.current) {
        scrollSettleTimer.current = window.setTimeout(settleScroll, 40);
        return;
      }
      const scroller = scrollerRef.current;
      if (scroller) scroller.dataset.scrollState = "settled";
      scrollSettleTimer.current = undefined;
      if (
        !scroller ||
        viewMode !== "ribbon" ||
        activeViewMode.current !== viewMode ||
        !visibleOrderedItems.length
      ) {
        return;
      }

      const nextIndex = getClosestRibbonIndex(
        ribbonMetrics.layouts,
        scroller.scrollLeft + scroller.clientWidth / 2,
      );
      const nextItem = visibleOrderedItems[nextIndex];
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
      scrollFrame.current = undefined;
      activatePreloadZone(nextOffset);
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
    const deltaPixels = dominantDelta * unit;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      scroller.scrollLeft = Math.min(
        maximum,
        Math.max(0, scroller.scrollLeft + deltaPixels),
      );
      return;
    }
    wheelVelocity.current = addWheelImpulse(wheelVelocity.current, deltaPixels);

    if (wheelFrame.current) return;
    const animate = (timestamp: number) => {
      const currentScroller = scrollerRef.current;
      if (!currentScroller || viewMode !== "ribbon") {
        wheelFrame.current = undefined;
        wheelVelocity.current = 0;
        wheelLastFrameTime.current = undefined;
        return;
      }

      const elapsedMs = wheelLastFrameTime.current
        ? timestamp - wheelLastFrameTime.current
        : 1000 / 60;
      wheelLastFrameTime.current = timestamp;
      const frame = advanceMomentum(
        currentScroller.scrollLeft,
        wheelVelocity.current,
        elapsedMs,
        0,
        Math.max(0, currentScroller.scrollWidth - currentScroller.clientWidth),
      );
      currentScroller.scrollLeft = frame.position;
      wheelVelocity.current = frame.velocity;
      if (frame.settled) {
        wheelFrame.current = undefined;
        wheelVelocity.current = 0;
        wheelLastFrameTime.current = undefined;
        return;
      }

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
    }
    if (wheelFrame.current) {
      window.cancelAnimationFrame(wheelFrame.current);
      wheelFrame.current = undefined;
    }
    wheelVelocity.current = 0;
    wheelLastFrameTime.current = undefined;
    if (scrollSettleTimer.current) {
      window.clearTimeout(scrollSettleTimer.current);
      scrollSettleTimer.current = undefined;
    }
    onViewModeChange(nextViewMode);
  }

  function handleArchiveKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!ARROW_KEYS.has(event.key)) return;
    const target = event.target as HTMLElement;
    if (target.matches("input, select, textarea") || target.isContentEditable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <section
      className={`archive-preview is-${viewMode}`}
      onKeyDownCapture={handleArchiveKeyDown}
    >
      <ArchiveHeader
        activeTab={viewMode}
        isImporting={isImporting}
        onImport={onImport}
        onTabChange={(tab) => {
          if (tab === "slideshow") onStartSlideshow();
          else handleViewModeChange(tab);
        }}
      />

      <div
        ref={scrollerRef}
        className="archive-scroller"
        data-testid="archive-scroller"
        data-rendered-count={orderedItems.length}
        data-visible-count={visibleOrderedItems.length}
        data-scroll-state="settled"
        onWheel={handleWheel}
        onScroll={handleScroll}
      >
        <div className="archive-track" style={trackStyle}>
          {orderedItems.map((item, sessionIndex) => {
            const visibleIndex = visibleIndexById.get(item.media.id);
            const layoutStyle = layoutStyleById.get(item.media.id);
            const isActivated = activatedIframeIdsRef.current.has(
              item.media.id,
            );
            const iframeStatus =
              iframeStatusByIdRef.current.get(item.media.id) ?? "not-activated";
            return (
              <ArchiveMediaCard
                key={item.media.id}
                item={item}
                index={visibleIndex ?? sessionIndex}
                selected={item.media.id === selectedId}
                loadMedia={isActivated}
                allowCompatibilityPreview={isActivated}
                visuallyHidden={!layoutStyle}
                iframeStatus={iframeStatus}
                registerShell={registerShell}
                onIframeLoad={handleIframeLoad}
                onIframeError={handleIframeError}
                layoutStyle={layoutStyle ?? HIDDEN_CARD_STYLE}
                onSelect={onSelect}
                onUnavailable={onMediaUnavailable}
              />
            );
          })}
          {!visibleOrderedItems.length && hasFilters ? (
            <div className="archive-empty-field">
              <strong>No photos match.</strong>
              <span>Widen the date range to bring photos back.</span>
            </div>
          ) : null}
        </div>
      </div>

      <motion.div
        className="archive-dock-motion"
        initial={{ y: "110%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <ArchiveControlBar dateRange={dateRange} />
      </motion.div>
    </section>
  );
});
