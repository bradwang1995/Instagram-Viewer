import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Pause,
  Play,
  Settings2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { TransitionPreset } from "../../db/schema";
import { getInstagramEmbedUrl } from "../../features/embed/instagramEmbedUrl";
import { getInstagramEmbedAvailability } from "../../features/embed/instagramOEmbed";
import type { MediaQueueItem } from "../../features/media/mediaQueue";

type ArchiveSlideshowProps = {
  open: boolean;
  item?: MediaQueueItem;
  index: number;
  total: number;
  isPlaying: boolean;
  elapsedMs: number;
  dwellMs: number;
  transitionDurationMs: number;
  transitionPreset: TransitionPreset;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlaying: () => void;
  onOpenSettings: () => void;
  onHide: () => void;
  onUnavailable: () => void;
  onClose: () => void;
};

export function ArchiveSlideshow({
  open,
  item,
  index,
  total,
  isPlaying,
  elapsedMs,
  dwellMs,
  transitionDurationMs,
  transitionPreset,
  onPrevious,
  onNext,
  onTogglePlaying,
  onOpenSettings,
  onHide,
  onUnavailable,
  onClose,
}: ArchiveSlideshowProps) {
  if (!open || !item) return null;
  const creator =
    item.media.creatorHandle ?? item.post.embedAuthorName ?? "Saved photo";
  const resolvedUrl = item.media.assetUrl ?? item.media.previewUrl;
  const motionState = getMotionState(transitionPreset);

  return (
    <motion.section
      className={`archive-slideshow preset-${transitionPreset}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      aria-label="Slideshow viewer"
    >
      <header className="slideshow-header">
        <div className="slideshow-header-actions">
          <button type="button" onClick={onHide} aria-label="Hide this media">
            <EyeOff size={17} aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} aria-label="Close slideshow">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="slideshow-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item.media.id}
            className="slideshow-frame"
            initial={motionState.initial}
            animate={motionState.animate}
            exit={motionState.exit}
            transition={{
              duration: transitionDurationMs / 1000,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {resolvedUrl ? (
              <img
                src={resolvedUrl}
                alt={item.media.caption ?? creator}
                onError={onUnavailable}
              />
            ) : (
              <SilentInstagramSlideshowEmbed
                item={item}
                onUnavailable={onUnavailable}
              />
            )}
          </motion.div>
        </AnimatePresence>
        {transitionPreset === "film-burn" ? (
          <motion.span
            key={item.media.id}
            className="slideshow-film-flash"
            initial={{ opacity: 0.52 }}
            animate={{ opacity: 0 }}
            transition={{
              duration: Math.min(0.7, transitionDurationMs / 1000),
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <footer className="slideshow-controls">
        <div className="slideshow-progress">
          <span>
            {String(index + 1).padStart(2, "0")} /{" "}
            {String(total).padStart(2, "0")}
          </span>
          <progress max={dwellMs} value={Math.min(elapsedMs, dwellMs)} />
          <span>{Math.round(dwellMs / 100) / 10}s</span>
        </div>
        <div className="slideshow-transport">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Previous media"
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <button
            className="slideshow-play"
            type="button"
            onClick={onTogglePlaying}
            aria-label={isPlaying ? "Pause slideshow" : "Play slideshow"}
          >
            {isPlaying ? (
              <Pause size={19} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={19} fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <button type="button" onClick={onNext} aria-label="Next media">
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </div>
        <button
          className="slideshow-settings"
          type="button"
          onClick={onOpenSettings}
        >
          <Settings2 size={16} aria-hidden="true" />{" "}
          {transitionPreset.replace("-", " ")}
        </button>
      </footer>
    </motion.section>
  );
}

function SilentInstagramSlideshowEmbed({
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

  if (!isValidated) return null;

  return (
    <div className="slideshow-embed">
      <iframe
        src={getInstagramEmbedUrl(item.post)}
        title={`Instagram preview ${item.post.shortcode ?? item.post.id}`}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
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
        initial: { opacity: 0, scale: 1.14, filter: "blur(10px)" },
        animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.92, filter: "blur(8px)" },
      };
    case "rgb-split":
      return {
        initial: { opacity: 0, x: 18, filter: "contrast(1.6) saturate(1.7)" },
        animate: { opacity: 1, x: 0, filter: "contrast(1) saturate(1)" },
        exit: { opacity: 0, x: -18, filter: "contrast(1.5) saturate(1.6)" },
      };
    case "ken-burns":
      return {
        initial: { opacity: 0, scale: 1.05 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.025 },
      };
    case "film-burn":
      return {
        initial: {
          opacity: 0,
          scale: 1.025,
          filter: "sepia(0.7) contrast(1.2)",
        },
        animate: { opacity: 1, scale: 1, filter: "sepia(0) contrast(1)" },
        exit: { opacity: 0, scale: 0.99, filter: "sepia(0.6) contrast(1.2)" },
      };
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
  }
}
