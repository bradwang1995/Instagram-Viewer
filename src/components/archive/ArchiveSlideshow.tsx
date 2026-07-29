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
  onUnavailable: () => void;
};

const TRANSITION_DURATION_SECONDS = 0.18;

export function ArchiveSlideshow({
  open,
  item,
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

  if (!open) return null;

  const creator =
    item?.media.creatorHandle ?? item?.post.embedAuthorName ?? "Saved photo";
  const resolvedUrl = item
    ? (item.media.assetUrl ?? item.media.previewUrl)
    : undefined;
  const motionState = getMotionState(transitionPreset);

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

        <AnimatePresence mode="wait" initial={false}>
          {item ? (
            <motion.div
              key={item.media.id}
              className="slideshow-frame"
              initial={motionState.initial}
              animate={motionState.animate}
              exit={motionState.exit}
              transition={{
                duration: TRANSITION_DURATION_SECONDS,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {resolvedUrl ? (
                <img
                  className="slideshow-photo"
                  src={resolvedUrl}
                  alt={item.media.caption ?? creator}
                  onError={onUnavailable}
                />
              ) : (
                <InstagramSlideshowEmbed
                  item={item}
                  onUnavailable={onUnavailable}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="slideshow-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <strong>No photos in this date range.</strong>
              <span>Widen the range below to continue the slideshow.</span>
            </motion.div>
          )}
        </AnimatePresence>

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

function getMotionState(preset: TransitionPreset) {
  switch (preset) {
    case "directional-wipe":
      return {
        initial: { opacity: 0, x: "18%", clipPath: "inset(0 0 0 100%)" },
        animate: { opacity: 1, x: 0, clipPath: "inset(0 0 0 0%)" },
        exit: { opacity: 0, x: "-12%", clipPath: "inset(0 100% 0 0)" },
      };
    case "depth-zoom":
      return {
        initial: { opacity: 0, scale: 1.08, filter: "blur(8px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.95, filter: "blur(6px)" },
      };
    case "rgb-split":
      return {
        initial: { opacity: 0, x: 18, filter: "contrast(1.6) saturate(1.7)" },
        animate: { opacity: 1, x: 0, filter: "contrast(1) saturate(1)" },
        exit: { opacity: 0, x: -18, filter: "contrast(1.5) saturate(1.6)" },
      };
    case "ken-burns":
      return {
        initial: { opacity: 0, scale: 1.035 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.02 },
      };
    case "film-burn":
      return {
        initial: {
          opacity: 0,
          scale: 1.02,
          filter: "sepia(0.55) contrast(1.12)",
        },
        animate: { opacity: 1, scale: 1, filter: "sepia(0) contrast(1)" },
        exit: { opacity: 0, scale: 0.99, filter: "sepia(0.45) contrast(1.1)" },
      };
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
  }
}
