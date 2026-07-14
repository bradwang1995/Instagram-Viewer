import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
  Shuffle,
} from "lucide-react";
import type { SavedPost } from "../../db/schema";
import { Button } from "../common/Button";

type SlideshowControlsProps = {
  post: SavedPost | undefined;
  index: number;
  total: number;
  isPlaying: boolean;
  isShuffle: boolean;
  intervalMs: number;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlaying: () => void;
  onToggleShuffle: () => void;
  onIntervalChange: (value: number) => void;
};

export function SlideshowControls({
  post,
  index,
  total,
  isPlaying,
  isShuffle,
  intervalMs,
  onPrevious,
  onNext,
  onTogglePlaying,
  onToggleShuffle,
  onIntervalChange,
}: SlideshowControlsProps) {
  return (
    <div className="slideshow-controls">
      <Button className="icon-button" variant="secondary" onClick={onPrevious} aria-label="Previous">
        <ChevronLeft size={19} aria-hidden="true" />
      </Button>
      <Button className="icon-button" variant="secondary" onClick={onNext} aria-label="Next">
        <ChevronRight size={19} aria-hidden="true" />
      </Button>
      <Button variant="secondary" onClick={onTogglePlaying}>
        {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        {isPlaying ? "Pause" : "Play"}
      </Button>
      <Button
        variant={isShuffle ? "primary" : "secondary"}
        onClick={onToggleShuffle}
      >
        <Shuffle size={16} aria-hidden="true" />
        Shuffle
      </Button>
      <select
        value={intervalMs}
        onChange={(event) => onIntervalChange(Number(event.target.value))}
        aria-label="Autoplay interval"
      >
        <option value={3000}>3s</option>
        <option value={5000}>5s</option>
        <option value={8000}>8s</option>
        <option value={12000}>12s</option>
      </select>
      {post ? (
        <a
          className="button button-secondary"
          href={post.canonicalUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} aria-hidden="true" />
          Open
        </a>
      ) : null}
      <span className="slide-counter">
        {total === 0 ? "0 / 0" : `${index + 1} / ${total}`}
      </span>
    </div>
  );
}
