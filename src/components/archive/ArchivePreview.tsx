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
  type WheelEvent,
} from "react";
import type { MediaQueueItem } from "../../features/media/mediaQueue";
import {
  getClosestRibbonIndex,
  getGridLayouts,
  getGridMetrics,
  getRetainedMediaLayouts,
  getRibbonMetrics,
} from "../../features/media/virtualMediaLayout";
import { preloadMediaItems } from "../../features/media/mediaPreload";
import { advanceTargetedMomentum } from "../../features/media/scrollMomentum";
import { extendSessionMediaOrder } from "../../features/media/sessionMediaOrder";
import {
  ArchiveControlBar,
  type ArchiveDateRange,
  ArchiveHeader,
} from "./ArchiveChrome";
import { ArchiveMediaCard } from "./ArchiveMediaCard";

export type ArchiveViewMode = "ribbon" | "grid";

type ArchivePreviewProps = {
  items: MediaQueueItem[];
  visibleItemIds: ReadonlySet<string>;
  selectedId?: string;
  viewMode: ArchiveViewMode;
  hasFilters: boolean;
  dateRange?: ArchiveDateRange;
  onOpenPost?: (mediaId: string) => void;
  photoLevel?: boolean;
  isImporting: boolean;
  keyboardNavigationEnabled: boolean;
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

type NavigationTarget = {
  viewMode: ArchiveViewMode;
  index: number;
  position: number;
};

const SCROLL_SETTLE_DELAY_MS = 180;
const WHEEL_BURST_RESET_MS = 180;
const MAX_WHEEL_BURST_STEPS = 2;
const GRID_AHEAD_VIEWPORTS = 2;
const HIDDEN_CARD_STYLE: CSSProperties = { display: "none" };
const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

export const ArchivePreview = memo(function ArchivePreview({
  items,
  visibleItemIds,
  selectedId,
  viewMode,
  hasFilters,
  dateRange,
  onOpenPost,
  photoLevel = false,
  isImporting,
  keyboardNavigationEnabled,
  onSelect,
  onMediaUnavailable,
  onImport,
  onViewModeChange,
  onStartSlideshow,
}: ArchivePreviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollRestoreFrame = useRef<number>();
  const scrollSettleTimer = useRef<number>();
  const navigationFrame = useRef<number>();
  const navigationTarget = useRef<NavigationTarget>();
  const navigationPosition = useRef<number>();
  const navigationVelocity = useRef(0);
  const navigationLastFrameTime = useRef<number>();
  const wheelBurstResetTimer = useRef<number>();
  const wheelBurstSteps = useRef(0);
  const mediaObserverRef = useRef<IntersectionObserver>();
  const cardShellsRef = useRef(new Map<string, HTMLElement>());
  const activatedMediaIdsRef = useRef(new Set<string>());
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
  const [, setMediaStateRevision] = useState(0);
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
  sessionOrders.current.ribbon = photoLevel
    ? currentIds
    : extendSessionMediaOrder(sessionOrders.current.ribbon, currentIds);
  sessionOrders.current.grid = photoLevel
    ? currentIds
    : extendSessionMediaOrder(sessionOrders.current.grid, currentIds);
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

  const activateMedia = useCallback((itemIds: Iterable<string>) => {
    let changed = false;
    for (const itemId of itemIds) {
      if (activatedMediaIdsRef.current.has(itemId)) continue;
      activatedMediaIdsRef.current.add(itemId);
      changed = true;
    }
    if (changed) setMediaStateRevision((revision) => revision + 1);
  }, []);

  const registerShell = useCallback(
    (itemId: string, node: HTMLElement | null) => {
      const previous = cardShellsRef.current.get(itemId);
      if (previous && previous !== node) {
        mediaObserverRef.current?.unobserve(previous);
      }
      if (!node) {
        cardShellsRef.current.delete(itemId);
        return;
      }
      cardShellsRef.current.set(itemId, node);
      mediaObserverRef.current?.observe(node);
    },
    [],
  );

  const synchronizeMediaWindow = useCallback(
    (offset: number, pruneOutsideWindow: boolean) => {
      const viewportLength =
        viewMode === "grid" ? viewport.height : viewport.width;
      const retainedIds = new Set<string>();
      const preloadItems: MediaQueueItem[] = [];

      getRetainedMediaLayouts(
        allLayouts,
        offset,
        viewportLength,
        viewMode === "grid" ? "vertical" : "horizontal",
        1,
        viewMode === "grid" ? GRID_AHEAD_VIEWPORTS : 1,
      ).forEach((layout) => {
        const item = visibleOrderedItems[layout.index];
        if (!item) return;
        retainedIds.add(item.media.id);
        preloadItems.push(item);
      });

      let pruned = false;
      if (pruneOutsideWindow) {
        for (const itemId of activatedMediaIdsRef.current) {
          if (retainedIds.has(itemId)) continue;
          if (!visibleItemIds.has(itemId)) continue;
          activatedMediaIdsRef.current.delete(itemId);
          pruned = true;
        }
      }
      activateMedia(retainedIds);
      if (pruned) setMediaStateRevision((revision) => revision + 1);
      preloadMediaItems(preloadItems);
    },
    [
      activateMedia,
      allLayouts,
      viewMode,
      viewport.height,
      viewport.width,
      visibleItemIds,
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
        activateMedia(
          entries
            .filter((entry) => entry.isIntersecting)
            .map((entry) => (entry.target as HTMLElement).dataset.mediaId)
            .filter((itemId): itemId is string => Boolean(itemId)),
        );
      },
      {
        root: scroller,
        rootMargin:
          viewMode === "grid" ? "0px 0px 200% 0px" : "0px 100% 0px 0px",
        threshold: 0,
      },
    );
    mediaObserverRef.current = observer;
    cardShellsRef.current.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      if (mediaObserverRef.current === observer) {
        mediaObserverRef.current = undefined;
      }
    };
  }, [activateMedia, viewMode]);

  useEffect(() => {
    synchronizeMediaWindow(scrollPositions.current[viewMode], true);
  }, [synchronizeMediaWindow, viewMode]);

  const cancelNavigationAnimation = useCallback(() => {
    if (navigationFrame.current) {
      window.cancelAnimationFrame(navigationFrame.current);
    }
    navigationFrame.current = undefined;
    navigationTarget.current = undefined;
    navigationPosition.current = undefined;
    navigationVelocity.current = 0;
    navigationLastFrameTime.current = undefined;
  }, []);

  const resetWheelBurst = useCallback(() => {
    if (wheelBurstResetTimer.current) {
      window.clearTimeout(wheelBurstResetTimer.current);
    }
    wheelBurstResetTimer.current = undefined;
    wheelBurstSteps.current = 0;
  }, []);

  const navigateByStep = useCallback(
    (direction: -1 | 1) => {
      const scroller = scrollerRef.current;
      if (!scroller || !visibleOrderedItems.length) return;

      let targetIndex: number;
      if (viewMode === "grid") {
        const lastRow =
          Math.ceil(visibleOrderedItems.length / gridMetrics.columns) - 1;
        const fallbackRow = Math.min(
          lastRow,
          Math.max(0, Math.round(scroller.scrollTop / gridMetrics.rowStride)),
        );
        const selectedIndex = selectedId
          ? visibleIndexById.get(selectedId)
          : undefined;
        const selectedLayout =
          selectedIndex === undefined ? undefined : allLayouts[selectedIndex];
        const selectedIsVisible = Boolean(
          selectedLayout &&
          selectedLayout.top + selectedLayout.height > scroller.scrollTop &&
          selectedLayout.top < scroller.scrollTop + viewport.height,
        );
        const selectedRow =
          selectedIndex === undefined
            ? undefined
            : Math.floor(selectedIndex / gridMetrics.columns);
        const activeTarget = navigationTarget.current;
        const targetedIndex =
          activeTarget?.viewMode === viewMode ? activeTarget.index : undefined;
        const currentRow =
          targetedIndex !== undefined
            ? Math.floor(targetedIndex / gridMetrics.columns)
            : selectedIsVisible && selectedRow !== undefined
              ? selectedRow
              : fallbackRow;
        const currentColumn =
          targetedIndex !== undefined
            ? targetedIndex % gridMetrics.columns
            : selectedIndex !== undefined && selectedIsVisible
              ? selectedIndex % gridMetrics.columns
              : 0;
        const targetRow = Math.min(
          lastRow,
          Math.max(0, currentRow + direction),
        );
        if (targetRow === currentRow) return;

        targetIndex = Math.min(
          visibleOrderedItems.length - 1,
          targetRow * gridMetrics.columns + currentColumn,
        );
        const targetLayout = allLayouts[targetIndex];
        if (!targetLayout) return;
        const maximum = Math.max(0, gridMetrics.totalHeight - viewport.height);
        navigationTarget.current = {
          viewMode,
          index: targetIndex,
          position: Math.min(
            maximum,
            Math.max(0, targetLayout.top - gridMetrics.paddingY),
          ),
        };
      } else {
        const viewportWidth = scroller.clientWidth || viewport.width;
        const selectedIndex = selectedId
          ? visibleIndexById.get(selectedId)
          : undefined;
        const selectedLayout =
          selectedIndex === undefined
            ? undefined
            : ribbonMetrics.layouts[selectedIndex];
        const selectedIsVisible = Boolean(
          selectedLayout &&
          selectedLayout.left + selectedLayout.width > scroller.scrollLeft &&
          selectedLayout.left < scroller.scrollLeft + viewportWidth,
        );
        const activeTarget = navigationTarget.current;
        const currentIndex =
          activeTarget?.viewMode === viewMode
            ? activeTarget.index
            : selectedIsVisible && selectedIndex !== undefined
              ? selectedIndex
              : getClosestRibbonIndex(
                  ribbonMetrics.layouts,
                  scroller.scrollLeft + viewportWidth / 2,
                );
        targetIndex = Math.min(
          visibleOrderedItems.length - 1,
          Math.max(0, currentIndex + direction),
        );
        if (targetIndex === currentIndex) return;

        const targetLayout = ribbonMetrics.layouts[targetIndex];
        if (!targetLayout) return;
        const maximum = Math.max(0, ribbonMetrics.totalWidth - viewportWidth);
        navigationTarget.current = {
          viewMode,
          index: targetIndex,
          position: Math.min(
            maximum,
            Math.max(
              0,
              targetLayout.left + targetLayout.width / 2 - viewportWidth / 2,
            ),
          ),
        };
      }

      const target = navigationTarget.current;
      if (!target) return;

      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        cancelNavigationAnimation();
        if (viewMode === "grid") {
          scroller.scrollTop = target.position;
        } else {
          scroller.scrollLeft = target.position;
        }
        scrollPositions.current[viewMode] = target.position;
      } else if (!navigationFrame.current) {
        scroller.dataset.scrollState = "moving";
        navigationPosition.current =
          viewMode === "grid" ? scroller.scrollTop : scroller.scrollLeft;
        const animateNavigation = (timestamp: number) => {
          const activeTarget = navigationTarget.current;
          const activeScroller = scrollerRef.current;
          if (!activeTarget || !activeScroller) {
            cancelNavigationAnimation();
            return;
          }

          const currentPosition =
            navigationPosition.current ??
            (activeTarget.viewMode === "grid"
              ? activeScroller.scrollTop
              : activeScroller.scrollLeft);
          const elapsedMs = navigationLastFrameTime.current
            ? timestamp - navigationLastFrameTime.current
            : 1000 / 60;
          const frame = advanceTargetedMomentum(
            currentPosition,
            navigationVelocity.current,
            activeTarget.position,
            elapsedMs,
          );
          navigationLastFrameTime.current = timestamp;
          navigationPosition.current = frame.position;
          navigationVelocity.current = frame.velocity;
          if (activeTarget.viewMode === "grid") {
            activeScroller.scrollTop = frame.position;
          } else {
            activeScroller.scrollLeft = frame.position;
          }
          scrollPositions.current[activeTarget.viewMode] = frame.position;

          if (frame.settled) {
            navigationFrame.current = undefined;
            navigationTarget.current = undefined;
            navigationPosition.current = undefined;
            navigationVelocity.current = 0;
            navigationLastFrameTime.current = undefined;
            return;
          }
          navigationFrame.current =
            window.requestAnimationFrame(animateNavigation);
        };
        navigationFrame.current =
          window.requestAnimationFrame(animateNavigation);
      }

      const targetItem = visibleOrderedItems[targetIndex];
      if (targetItem && targetItem.media.id !== selectedId) {
        onSelect(targetItem.media.id);
      }
    },
    [
      allLayouts,
      cancelNavigationAnimation,
      gridMetrics,
      onSelect,
      ribbonMetrics,
      selectedId,
      viewMode,
      viewport.height,
      viewport.width,
      visibleIndexById,
      visibleOrderedItems,
    ],
  );

  useEffect(() => {
    if (!keyboardNavigationEnabled) return undefined;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const direction =
        viewMode === "grid"
          ? event.key === "ArrowUp"
            ? -1
            : event.key === "ArrowDown"
              ? 1
              : undefined
          : event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowRight"
              ? 1
              : undefined;
      if (!ARROW_KEYS.has(event.key)) return;

      event.preventDefault();
      event.stopPropagation();
      if (direction) {
        resetWheelBurst();
        navigateByStep(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [keyboardNavigationEnabled, navigateByStep, resetWheelBurst, viewMode]);

  useEffect(
    () => () => {
      cancelNavigationAnimation();
      resetWheelBurst();
      if (scrollRestoreFrame.current) {
        window.cancelAnimationFrame(scrollRestoreFrame.current);
      }
      if (scrollSettleTimer.current) {
        window.clearTimeout(scrollSettleTimer.current);
      }
    },
    [cancelNavigationAnimation, resetWheelBurst],
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

    cancelNavigationAnimation();

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
    cancelNavigationAnimation,
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
    scroller.dataset.scrollState = "moving";
    if (scrollSettleTimer.current) {
      window.clearTimeout(scrollSettleTimer.current);
    }
    const settleScroll = () => {
      if (navigationFrame.current) {
        scrollSettleTimer.current = window.setTimeout(settleScroll, 40);
        return;
      }
      const scroller = scrollerRef.current;
      if (scroller) scroller.dataset.scrollState = "settled";
      scrollSettleTimer.current = undefined;
      if (!scroller || activeViewMode.current !== viewMode) {
        return;
      }

      const settledOffset =
        viewMode === "grid" ? scroller.scrollTop : scroller.scrollLeft;
      synchronizeMediaWindow(settledOffset, true);
      if (viewMode === "ribbon" && visibleOrderedItems.length) {
        const nextIndex = getClosestRibbonIndex(
          ribbonMetrics.layouts,
          scroller.scrollLeft + scroller.clientWidth / 2,
        );
        const nextItem = visibleOrderedItems[nextIndex];
        if (nextItem && nextItem.media.id !== selectedId) {
          onSelect(nextItem.media.id);
        }
      }
    };
    scrollSettleTimer.current = window.setTimeout(
      settleScroll,
      SCROLL_SETTLE_DELAY_MS,
    );
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    const dominantDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!dominantDelta) return;

    event.preventDefault();
    const direction = dominantDelta < 0 ? -1 : 1;
    const nextBurstSteps = wheelBurstSteps.current + direction;
    if (Math.abs(nextBurstSteps) <= MAX_WHEEL_BURST_STEPS) {
      wheelBurstSteps.current = nextBurstSteps;
      navigateByStep(direction);
    }
    if (wheelBurstResetTimer.current) {
      window.clearTimeout(wheelBurstResetTimer.current);
    }
    wheelBurstResetTimer.current = window.setTimeout(() => {
      wheelBurstResetTimer.current = undefined;
      wheelBurstSteps.current = 0;
    }, WHEEL_BURST_RESET_MS);
  }

  function handleViewModeChange(nextViewMode: ArchiveViewMode) {
    if (nextViewMode === viewMode) return;
    cancelNavigationAnimation();
    resetWheelBurst();
    pendingViewMode.current = nextViewMode;
    const scroller = scrollerRef.current;
    if (scroller) {
      const currentOffset =
        viewMode === "grid" ? scroller.scrollTop : scroller.scrollLeft;
      scrollPositions.current[viewMode] = currentOffset;
    }
    if (scrollSettleTimer.current) {
      window.clearTimeout(scrollSettleTimer.current);
      scrollSettleTimer.current = undefined;
    }
    onViewModeChange(nextViewMode);
  }

  return (
    <section className={`archive-preview is-${viewMode}`}>
      <ArchiveHeader
        activeTab={viewMode}
        photoLevel={photoLevel}
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
            const isActivated = activatedMediaIdsRef.current.has(item.media.id);
            return (
              <ArchiveMediaCard
                key={item.media.id}
                item={item}
                index={visibleIndex ?? sessionIndex}
                selected={item.media.id === selectedId}
                loadMedia={isActivated}
                visuallyHidden={!layoutStyle}
                registerShell={registerShell}
                layoutStyle={layoutStyle ?? HIDDEN_CARD_STYLE}
                onSelect={onOpenPost ?? onSelect}
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

      {dateRange ? (
        <motion.div
          className="archive-dock-motion"
          initial={{ y: "110%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <ArchiveControlBar dateRange={dateRange} />
        </motion.div>
      ) : null}
    </section>
  );
});
