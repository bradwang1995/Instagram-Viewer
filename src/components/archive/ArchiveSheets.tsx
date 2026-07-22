import { EyeOff, RotateCcw, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { TransitionPreset } from "../../db/schema";
import type { MediaQueueItem } from "../../features/media/mediaQueue";

type FilterSheetProps = {
  open: boolean;
  query: string;
  creator: string;
  collection: string;
  creators: string[];
  collections: string[];
  onQueryChange: (value: string) => void;
  onCreatorChange: (value: string) => void;
  onCollectionChange: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
};

export function ArchiveFilterSheet({
  open,
  query,
  creator,
  collection,
  creators,
  collections,
  onQueryChange,
  onCreatorChange,
  onCollectionChange,
  onClear,
  onClose,
}: FilterSheetProps) {
  return (
    <ArchiveSheet open={open} label="Filter photos" onClose={onClose}>
      <div className="archive-sheet-lede">
        <span>Find a source</span>
        <h2>Reduce the field without losing the visual flow.</h2>
      </div>
      <label className="archive-search-field">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Search photos</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Creator, collection, caption, or shortcode"
        />
      </label>
      <div className="archive-filter-row">
        <label>
          <span>Creator</span>
          <select
            aria-label="Creator"
            value={creator}
            onChange={(event) => onCreatorChange(event.target.value)}
          >
            <option value="">All creators</option>
            {creators.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Collection</span>
          <select
            aria-label="Collection"
            value={collection}
            onChange={(event) => onCollectionChange(event.target.value)}
          >
            <option value="">All collections</option>
            {collections.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button className="archive-sheet-reset" type="button" onClick={onClear}>
          <RotateCcw size={15} aria-hidden="true" /> Clear filters
        </button>
      </div>
    </ArchiveSheet>
  );
}

type SettingsSheetProps = {
  open: boolean;
  dwellMs: number;
  transitionDurationMs: number;
  transitionPreset: TransitionPreset;
  loopMode: "off" | "session" | "source-post";
  hiddenItems: MediaQueueItem[];
  onDwellChange: (value: number) => void;
  onTransitionDurationChange: (value: number) => void;
  onTransitionPresetChange: (value: TransitionPreset) => void;
  onLoopModeChange: (value: "off" | "session" | "source-post") => void;
  onRestore: (mediaId: string) => void;
  onRestoreAll: () => void;
  onClose: () => void;
};

const PRESETS: Array<{ value: TransitionPreset; label: string }> = [
  { value: "crossfade", label: "Crossfade" },
  { value: "directional-wipe", label: "Directional wipe" },
  { value: "depth-zoom", label: "Depth zoom" },
  { value: "film-burn", label: "Film burn" },
  { value: "rgb-split", label: "RGB split" },
  { value: "ken-burns", label: "Ken Burns" },
];

export function ArchiveSettingsSheet({
  open,
  dwellMs,
  transitionDurationMs,
  transitionPreset,
  loopMode,
  hiddenItems,
  onDwellChange,
  onTransitionDurationChange,
  onTransitionPresetChange,
  onLoopModeChange,
  onRestore,
  onRestoreAll,
  onClose,
}: SettingsSheetProps) {
  return (
    <ArchiveSheet open={open} label="Slideshow settings" onClose={onClose}>
      <div className="archive-sheet-lede">
        <span>Slideshow</span>
        <h2>Set the pace before the room goes dark.</h2>
      </div>
      <div className="archive-setting-grid">
        <label className="archive-range">
          <span>
            Frame duration <output>{Math.round(dwellMs / 100) / 10}s</output>
          </span>
          <input
            type="range"
            min={1000}
            max={30000}
            step={500}
            value={dwellMs}
            onChange={(event) => onDwellChange(Number(event.target.value))}
          />
        </label>
        <label className="archive-range">
          <span>
            Transition <output>{transitionDurationMs}ms</output>
          </span>
          <input
            type="range"
            min={150}
            max={3000}
            step={50}
            value={transitionDurationMs}
            onChange={(event) =>
              onTransitionDurationChange(Number(event.target.value))
            }
          />
        </label>
        <label>
          <span>Transition style</span>
          <select
            aria-label="Transition style"
            value={transitionPreset}
            onChange={(event) =>
              onTransitionPresetChange(event.target.value as TransitionPreset)
            }
          >
            {PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Loop</span>
          <select
            aria-label="Loop"
            value={loopMode}
            onChange={(event) =>
              onLoopModeChange(
                event.target.value as "off" | "session" | "source-post",
              )
            }
          >
            <option value="off">Stop at the end</option>
            <option value="session">Loop all photos</option>
            <option value="source-post">Loop current post</option>
          </select>
        </label>
      </div>

      <div className="archive-hidden-list">
        <div>
          <span>Hidden media</span>
          <strong>{hiddenItems.length}</strong>
          {hiddenItems.length ? (
            <button type="button" onClick={onRestoreAll}>
              Restore all
            </button>
          ) : null}
        </div>
        {hiddenItems.length ? (
          hiddenItems.slice(0, 12).map((item) => (
            <div className="archive-hidden-row" key={item.media.id}>
              <span className="archive-hidden-preview">
                {item.media.previewUrl || item.media.assetUrl ? (
                  <img
                    src={(item.media.previewUrl ?? item.media.assetUrl)!}
                    alt=""
                  />
                ) : (
                  <EyeOff size={16} aria-hidden="true" />
                )}
              </span>
              <span>
                <strong>
                  {item.media.creatorHandle ??
                    item.post.embedAuthorName ??
                    "Instagram source"}
                </strong>
                <small>Frame {item.media.sourceIndex + 1}</small>
              </span>
              <button type="button" onClick={() => onRestore(item.media.id)}>
                Restore
              </button>
            </div>
          ))
        ) : (
          <p>
            Nothing is hidden. Use the eye control on any frame to remove it.
          </p>
        )}
      </div>
    </ArchiveSheet>
  );
}

function ArchiveSheet({
  open,
  label,
  children,
  onClose,
}: {
  open: boolean;
  label: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            className="archive-sheet-backdrop"
            aria-label={`Close ${label}`}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="archive-sheet"
            aria-label={label}
            initial={{ y: "102%" }}
            animate={{ y: 0 }}
            exit={{ y: "102%" }}
            transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              className="archive-sheet-close"
              type="button"
              aria-label={`Close ${label}`}
              onClick={onClose}
            >
              <X size={19} aria-hidden="true" /> Close
            </button>
            {children}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
