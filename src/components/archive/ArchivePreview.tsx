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

export function ArchivePreview({
  items,
  selectedId,
  hiddenCount,
  viewMode,
  hasFilters,
  isImporting,
  onSelect,
  onImport,
  onOpenFilters,
  onOpenSettings,
  onViewModeChange,
  onStartSlideshow,
}: ArchivePreviewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number>();
  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewport, setViewport] = useState<ViewportSize>(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height:
      typeof window === "undefined"
        ? 720
        : Math.max(320, window.innerHeight - 160),
  }));
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.media.id === selectedId),
  );
  const aspects = useMemo(
    () =>
      items.map(({ media }) =>
        media.width && media.height ? media.width / media.height : 0.78,
      ),
    [items],
  );
  const ribbonMetrics = useMemo(
    () => getRibbonMetrics(aspects, viewport.width, viewport.height),
    [aspects, viewport],
  );
  const gridMetrics = useMemo(
    () => getGridMetrics(items.length, viewport.width, viewport.height),
    [items.length, viewport],
  );
  const visibleLayouts = useMemo(
    () =>
      viewMode === "grid"
        ? getGridWindow(items.length, scrollOffset, gridMetrics)
        : getRibbonWindow(ribbonMetrics.layouts, scrollOffset, viewport.width),
    [
      gridMetrics,
      items.length,
      ribbonMetrics.layouts,
      scrollOffset,
      viewMode,
      viewport.width,
    ],
  );
  const trackStyle = useMemo<CSSProperties>(
    () =>
      viewMode === "grid"
        ? { width: "100%", height: gridMetrics.totalHeight }
        : { width: ribbonMetrics.totalWidth, height: "100%" },
    [gridMetrics.totalHeight, ribbonMetrics.totalWidth, viewMode],
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    const measure = () => {
      setViewport({
        width: scroller.clientWidth || window.innerWidth,
        height:
          scroller.clientHeight || Math.max(320, window.innerHeight - 160),
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

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ left: 0, top: 0 });
    } else {
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
    }
    setScrollOffset(0);
  }, [items, viewMode]);

  useEffect(() => {
    if (!selectedId) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (viewMode === "grid") {
      const row = Math.floor(selectedIndex / gridMetrics.columns);
      const itemTop = gridMetrics.paddingY + row * gridMetrics.rowStride;
      const itemBottom = itemTop + gridMetrics.itemHeight;
      const visibleTop = scroller.scrollTop;
      const visibleBottom = visibleTop + scroller.clientHeight;
      if (itemTop < visibleTop || itemBottom > visibleBottom) {
        const top = Math.max(0, itemTop - gridMetrics.paddingY);
        if (typeof scroller.scrollTo === "function") {
          scroller.scrollTo({ top, behavior: "smooth" });
        } else {
          scroller.scrollTop = top;
        }
      }
      return;
    }

    const layout = ribbonMetrics.layouts[selectedIndex];
    if (!layout) return;

    const cardCenter = layout.left + layout.width / 2;
    const visibleStart = scroller.scrollLeft + scroller.clientWidth * 0.12;
    const visibleEnd = scroller.scrollLeft + scroller.clientWidth * 0.88;
    if (cardCenter < visibleStart || cardCenter > visibleEnd) {
      const left = Math.max(0, cardCenter - scroller.clientWidth / 2);
      if (typeof scroller.scrollTo === "function") {
        scroller.scrollTo({ left, behavior: "smooth" });
      } else {
        scroller.scrollLeft = left;
      }
    }
  }, [gridMetrics, ribbonMetrics.layouts, selectedId, selectedIndex, viewMode]);

  function handleScroll() {
    if (scrollFrame.current) window.cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = window.requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const nextOffset =
        viewMode === "grid" ? scroller.scrollTop : scroller.scrollLeft;
      setScrollOffset(nextOffset);

      if (viewMode === "ribbon" && items.length) {
        const nextIndex = getClosestRibbonIndex(
          ribbonMetrics.layouts,
          scroller.scrollLeft + scroller.clientWidth / 2,
        );
        const nextItem = items[nextIndex];
        if (nextItem && nextItem.media.id !== selectedId) {
          onSelect(nextItem.media.id);
        }
      }
    });
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (viewMode !== "ribbon") return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    event.currentTarget.scrollLeft += event.deltaY * 1.2;
  }

  return (
    <section className={`archive-preview is-${viewMode}`}>
      <header className="archive-header">
        <a className="archive-logo" href={import.meta.env.BASE_URL}>
          <strong>Instagram Viewer</strong>
          <span>Local-first photo viewer</span>
        </a>
        <button
          className="archive-import-link"
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
        onWheel={handleWheel}
        onScroll={handleScroll}
      >
        <div className="archive-track" style={trackStyle}>
          {items.length ? (
            visibleLayouts.map((layout) => {
              const item = items[layout.index];
              const layoutStart =
                viewMode === "grid" ? layout.top : layout.left;
              const layoutEnd =
                layoutStart +
                (viewMode === "grid" ? layout.height : layout.width);
              const viewportExtent =
                viewMode === "grid" ? viewport.height : viewport.width;
              const allowCompatibilityPreview =
                (viewMode === "ribbon" && item.media.id === selectedId) ||
                (layoutStart < scrollOffset + viewportExtent &&
                  layoutEnd > scrollOffset);
              return (
                <ArchiveMediaCard
                  key={item.media.id}
                  item={item}
                  index={layout.index}
                  selected={item.media.id === selectedId}
                  allowCompatibilityPreview={allowCompatibilityPreview}
                  layoutStyle={{
                    position: "absolute",
                    left: layout.left,
                    top: layout.top,
                    width: layout.width,
                    height: layout.height,
                  }}
                  onSelect={() => onSelect(item.media.id)}
                />
              );
            })
          ) : (
            <div className="archive-empty-field">
              <strong>No photos match.</strong>
              <span>Open Filter and clear the current search.</span>
            </div>
          )}
        </div>
      </div>

      <motion.div
        className="archive-dock"
        initial={{ y: "110%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="dock-modes" aria-label="Photo layout">
          <button
            className={viewMode === "ribbon" ? "is-active" : ""}
            type="button"
            onClick={() => onViewModeChange("ribbon")}
          >
            <MoveHorizontal size={18} aria-hidden="true" /> Horizontal View
          </button>
          <button
            className={viewMode === "grid" ? "is-active" : ""}
            type="button"
            onClick={() => onViewModeChange("grid")}
          >
            <Grid2X2 size={17} aria-hidden="true" /> Grid View
          </button>
        </div>

        <div className="dock-actions">
          <button
            className={hasFilters ? "is-active" : ""}
            type="button"
            onClick={onOpenFilters}
          >
            <Search size={18} aria-hidden="true" /> Filter
          </button>
          <button type="button" onClick={onOpenSettings}>
            {hiddenCount ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Settings2 size={18} aria-hidden="true" />
            )}
            Settings
          </button>
          <button
            className="dock-play"
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
