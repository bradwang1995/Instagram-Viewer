import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { TransitionPreset } from "../../db/schema";
import { getInstagramEmbedUrl } from "../../features/embed/instagramEmbedUrl";
import { getInstagramEmbedAvailability } from "../../features/embed/instagramOEmbed";
import type { MediaQueueItem } from "../../features/media/mediaQueue";
import {
  ArchiveControlBar,
  type ArchiveDateRange,
  ArchiveHeader,
  type ArchiveTab,
} from "./ArchiveChrome";

type ArchiveSlideshowProps = {
  open: boolean;
  item?: MediaQueueItem;
  previousItem?: MediaQueueItem;
  nextItem?: MediaQueueItem;
  direction: 1 | -1;
  dwellMs: number;
  transitionPreset: TransitionPreset;
  dateRange: ArchiveDateRange;
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

const TRANSITION_DURATION_SECONDS = 0.36;

export function ArchiveSlideshow({
  open,
  item,
  previousItem,
  nextItem,
  direction,
  dwellMs,
  transitionPreset,
  dateRange,
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

  useEffect(() => {
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
  }, [onNext, onPrevious]);

  const frames = getSlideshowFrames(
    item,
    previousItem,
    nextItem,
    direction,
    previousCurrentIdRef.current,
  );

  useEffect(() => {
    previousCurrentIdRef.current = item?.media.id;
  }, [item?.media.id]);

  if (!open) return null;

  const resolvedUrl = item
    ? (item.media.assetUrl ?? item.media.previewUrl)
    : undefined;

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
        isImporting={isImporting}
        onImport={onImport}
        onTabChange={onTabChange}
      />

      <div className="slideshow-stage">
        {resolvedUrl ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.img
              key={`backdrop:${item?.media.id}`}
              className="slideshow-backdrop"
              src={resolvedUrl}
              alt=""
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.72 }}
              exit={{ opacity: 0 }}
              transition={{ duration: TRANSITION_DURATION_SECONDS }}
            />
          </AnimatePresence>
        ) : null}

        {frames.length ? (
          frames.map((frame) => {
            const frameResolvedUrl =
              frame.item.media.assetUrl ?? frame.item.media.previewUrl;
            const creator =
              frame.item.media.creatorHandle ??
              frame.item.post.embedAuthorName ??
              "Saved photo";
            return (
              <motion.div
                key={frame.item.media.id}
                className={`slideshow-frame${frame.slot === 0 ? " is-current" : " is-preloaded"}`}
                data-slideshow-slot={frame.slot}
                aria-hidden={frame.slot === 0 ? undefined : true}
                initial={false}
                animate={getFrameMotion(transitionPreset, frame.slot)}
                transition={{
                  duration: TRANSITION_DURATION_SECONDS,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {frameResolvedUrl ? (
                  <img
                    className="slideshow-photo"
                    src={frameResolvedUrl}
                    alt={frame.item.media.caption ?? creator}
                    loading="eager"
                    decoding="async"
                    onError={() => onUnavailable(frame.item.media.id)}
                  />
                ) : (
                  <InstagramSlideshowEmbed
                    item={frame.item}
                    onUnavailable={() => onUnavailable(frame.item.media.id)}
                  />
                )}
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
            className="slideshow-film-flash"
            initial={{ opacity: 0.42 }}
            animate={{ opacity: 0 }}
            transition={{ duration: TRANSITION_DURATION_SECONDS }}
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

function InstagramSlideshowEmbed({
  item,
  onUnavailable,
}: {
  item: MediaQueueItem;
  onUnavailable: () => void;
}) {
  const [isValidated, setIsValidated] = useState(false);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    let active = true;
    setIsValidated(false);
    void getInstagramEmbedAvailability(item.post.canonicalUrl).then(
      (availability) => {
        if (!active) return;
        if (availability === "unavailable") {
          onUnavailableRef.current();
          return;
        }
        setIsValidated(true);
      },
    );
    return () => {
      active = false;
    };
  }, [item.post.canonicalUrl]);

  if (!isValidated) {
    return <span className="slideshow-loading">Loading photo…</span>;
  }

  return (
    <div className="slideshow-embed">
      <iframe
        src={getInstagramEmbedUrl(item.post)}
        title={`Instagram preview ${item.post.shortcode ?? item.post.id}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        scrolling="no"
        tabIndex={-1}
        onError={onUnavailable}
      />
    </div>
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
  const directionalX = `${slot * 100}%`;

  switch (preset) {
    case "directional-wipe":
      return {
        opacity: isCurrent ? 1 : 0,
        x: directionalX,
        clipPath: isCurrent ? "inset(0 0 0 0%)" : "inset(0 12% 0 12%)",
      };
    case "depth-zoom":
      return {
        opacity: isCurrent ? 1 : 0,
        x: `${slot * 10}%`,
        scale: isCurrent ? 1 : 1.06,
        filter: isCurrent ? "blur(0px)" : "blur(8px)",
      };
    case "rgb-split":
      return {
        opacity: isCurrent ? 1 : 0,
        x: `${slot * 8}%`,
        filter: isCurrent
          ? "contrast(1) saturate(1)"
          : "contrast(1.6) saturate(1.7)",
      };
    case "ken-burns":
      return {
        opacity: isCurrent ? 1 : 0,
        x: `${slot * 6}%`,
        scale: isCurrent ? 1 : 1.035,
      };
    case "film-burn":
      return {
        opacity: isCurrent ? 1 : 0,
        x: `${slot * 8}%`,
        scale: isCurrent ? 1 : 1.02,
        filter: isCurrent
          ? "sepia(0) contrast(1)"
          : "sepia(0.55) contrast(1.12)",
      };
    default:
      return {
        opacity: isCurrent ? 1 : 0,
        x: `${slot * 6}%`,
      };
  }
}
