import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSlideshowPlayback } from "../../hooks/useSlideshowPlayback";
import type { TransitionPreset } from "../../db/schema";
import { ArchiveMediaCard } from "./ArchiveMediaCard";
import type { MediaQueueItem } from "../../features/media/mediaQueue";
import {
  ArchiveControlBar,
  type ArchiveDateRange,
  ArchiveHeader,
  type ArchiveTab,
} from "./ArchiveChrome";

type ArchiveSlideshowProps = {
  open: boolean;
  active?: boolean;
  loadGeneration?: number;
  loadScope?: string;
  item?: MediaQueueItem;
  previousItem?: MediaQueueItem;
  nextItem?: MediaQueueItem;
  direction: 1 | -1;
  dwellMs: number;
  transitionPreset: TransitionPreset;
  dateRange?: ArchiveDateRange;
  photoLevel?: boolean;
  keyboardNavigationEnabled?: boolean;
  onOpenPost?: (mediaId: string) => void;
  isImporting: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onTabChange: (tab: ArchiveTab) => void;
  onImport: () => void;
  onDwellChange: (value: number) => void;
  onTransitionPresetChange: (value: TransitionPreset) => void;
  onUnavailable: (mediaId: string) => void;
};

type SlideshowFrame = {
  item: MediaQueueItem;
  slot: -1 | 0 | 1;
};

const TRANSITION_DURATION_SECONDS = 0.7;

export function ArchiveSlideshow({
  open,
  active = true,
  loadGeneration = 0,
  loadScope = "",
  item,
  previousItem,
  nextItem,
  direction,
  dwellMs,
  transitionPreset,
  dateRange,
  photoLevel = false,
  keyboardNavigationEnabled = true,
  onOpenPost,
  isImporting,
  onPrevious,
  onNext,
  onTabChange,
  onImport,
  onDwellChange,
  onTransitionPresetChange,
  onUnavailable,
}: ArchiveSlideshowProps) {
  const previousCurrentIdRef = useRef<string>();
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const onLoadStateChange = useCallback((id: string, ready: boolean) => {
    setReadyIds((previous) =>
      ready
        ? previous.includes(id)
          ? previous
          : [...previous.slice(-7), id]
        : previous.includes(id)
          ? previous.filter((value) => value !== id)
          : previous,
    );
  }, []);
  const visible = useSlideshowPlayback(
    open && active,
    item?.media.id,
    !!item && readyIds.includes(item.media.id),
    dwellMs,
    onNext,
  );

  useEffect(() => {
    if (!open || !keyboardNavigationEnabled) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target =
        event.target instanceof HTMLElement ? event.target : undefined;
      if (
        target?.matches("input, select, textarea, button") ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, keyboardNavigationEnabled, onNext, onPrevious]);

  const frames = getSlideshowFrames(
    item,
    previousItem,
    nextItem,
    direction,
    previousCurrentIdRef.current,
  );
  const admittedFrames = useRef<{ key: string; ids: Set<string> }>();
  const [, refreshAdmission] = useState(0);
  const key = `${loadGeneration}:${loadScope}`;
  if (frames.length && admittedFrames.current?.key !== key) {
    admittedFrames.current = {
      key,
      ids: new Set(frames.map((frame) => frame.item.media.id)),
    };
  }

  useEffect(() => {
    const id = item?.media.id;
    if (
      !open ||
      !active ||
      !visible ||
      !id ||
      admittedFrames.current?.ids.has(id)
    )
      return;
    // A failed cohort must not stall playback or trigger a rapid replacement cascade.
    // Admit just the replacement current card after one dwell, leaving neighbors paused.
    const timer = window.setTimeout(() => {
      if (admittedFrames.current?.key !== key) return;
      admittedFrames.current.ids = new Set([id]);
      refreshAdmission((value) => value + 1);
    }, dwellMs);
    return () => window.clearTimeout(timer);
  }, [open, active, visible, item?.media.id, key, dwellMs]);

  useEffect(() => {
    previousCurrentIdRef.current = item?.media.id;
  }, [item?.media.id]);

  if (!open) return null;

  return (
    <motion.section
      className={`archive-slideshow preset-${transitionPreset}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: TRANSITION_DURATION_SECONDS }}
      aria-label="Slideshow viewer"
    >
      <ArchiveHeader
        activeTab="slideshow"
        photoLevel={photoLevel}
        isImporting={isImporting}
        onImport={onImport}
        onTabChange={onTabChange}
      />

      <div className="slideshow-stage">
        {item ? (
          <>
            <button
              className="slideshow-arrow is-previous"
              aria-label="Previous photo"
              onClick={onPrevious}
              disabled={!previousItem}
            >
              <ChevronLeft />
            </button>
            <button
              className="slideshow-arrow is-next"
              aria-label="Next photo"
              onClick={onNext}
              disabled={!nextItem}
            >
              <ChevronRight />
            </button>
          </>
        ) : null}
        {frames.length ? (
          frames.map((frame) => {
            return (
              <motion.div
                key={frame.item.media.id}
                className={`slideshow-frame${frame.slot === 0 ? " is-current" : " is-preloaded"}`}
                data-slideshow-slot={frame.slot}
                data-media-id={frame.item.media.id}
                aria-hidden={frame.slot === 0 ? undefined : true}
                initial={false}
                animate={getFrameMotion(transitionPreset, frame.slot)}
                style={{ zIndex: frame.slot === 0 ? 3 : 2 }}
                transition={{
                  duration: TRANSITION_DURATION_SECONDS,
                  ...(transitionPreset === "ken-burns" && frame.slot === 0
                    ? { scale: { duration: dwellMs / 1000, ease: "linear" } }
                    : {}),
                  ...(transitionPreset === "directional-wipe" &&
                  frame.slot !== 0
                    ? {
                        opacity: {
                          duration: 0,
                          delay: TRANSITION_DURATION_SECONDS,
                        },
                        clipPath: {
                          duration: 0,
                          delay: TRANSITION_DURATION_SECONDS,
                        },
                      }
                    : {}),
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <ArchiveMediaCard
                  item={frame.item}
                  index={0}
                  selected={false}
                  loadMedia={
                    active &&
                    visible &&
                    !!admittedFrames.current?.ids.has(frame.item.media.id)
                  }
                  layoutStyle={{ width: "100%", height: "100%" }}
                  onSelect={onOpenPost ?? (() => {})}
                  onUnavailable={onUnavailable}
                  onLoadStateChange={onLoadStateChange}
                />
              </motion.div>
            );
          })
        ) : (
          <AnimatePresence initial={false}>
            <motion.div
              key="empty"
              className="slideshow-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <strong>No photos in this date range.</strong>
              <span>Widen the range below to continue the slideshow.</span>
            </motion.div>
          </AnimatePresence>
        )}

        {item && transitionPreset === "film-burn" ? (
          <motion.span
            key={item.media.id}
            className="slideshow-film-tint"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.22, 0] }}
            transition={{
              duration: 1.15,
              times: [0, 0.4, 1],
              ease: "easeInOut",
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <ArchiveControlBar
        dateRange={dateRange}
        slideshow={{
          dwellMs,
          transitionPreset,
          onDwellChange,
          onTransitionPresetChange,
        }}
      />
    </motion.section>
  );
}

function getSlideshowFrames(
  current: MediaQueueItem | undefined,
  previous: MediaQueueItem | undefined,
  next: MediaQueueItem | undefined,
  direction: 1 | -1,
  previousCurrentId: string | undefined,
): SlideshowFrame[] {
  if (!current) return [];

  const frames = new Map<string, SlideshowFrame>([
    [current.media.id, { item: current, slot: 0 }],
  ]);
  if (previous && previous.media.id !== current.media.id) {
    frames.set(previous.media.id, { item: previous, slot: -1 });
  }
  if (next && next.media.id !== current.media.id) {
    const duplicate = frames.get(next.media.id);
    const slot =
      next.media.id === previousCurrentId
        ? direction === 1
          ? -1
          : 1
        : duplicate
          ? direction
          : 1;
    frames.set(next.media.id, { item: next, slot });
  }
  return Array.from(frames.values());
}

function getFrameMotion(preset: TransitionPreset, slot: -1 | 0 | 1) {
  const isCurrent = slot === 0;

  const base = {
    opacity: isCurrent ? 1 : 0,
    scale: 1,
    filter: "none",
    clipPath: "inset(0 0 0 0%)",
  };
  switch (preset) {
    case "directional-wipe":
      return {
        ...base,
        clipPath: isCurrent ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
      };
    case "depth-zoom":
      return {
        ...base,
        opacity: isCurrent ? 1 : 0,
        scale: isCurrent ? 1 : 1.24,
        filter: isCurrent ? "blur(0px)" : "blur(20px)",
      };
    case "rgb-split":
      return {
        ...base,
        opacity: isCurrent ? 1 : 0,
        filter: isCurrent
          ? [
              "hue-rotate(-55deg) saturate(1.9)",
              "hue-rotate(65deg) saturate(1.55)",
              "hue-rotate(0deg) saturate(1)",
            ]
          : "hue-rotate(0deg) saturate(1)",
      };
    case "ken-burns":
      return {
        ...base,
        opacity: isCurrent ? 1 : 0,
        scale: isCurrent ? [1, 1.14] : 1,
      };
    default:
      return base;
  }
}
