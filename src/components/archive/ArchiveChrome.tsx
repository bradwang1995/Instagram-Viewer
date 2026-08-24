import { Grid2X2, MoveHorizontal, Play, Upload } from "lucide-react";
import type { CSSProperties } from "react";
import type { TransitionPreset } from "../../db/schema";
import type { ArchiveViewMode } from "./ArchivePreview";

export type ArchiveTab = ArchiveViewMode | "slideshow";

export type ArchiveDateRange = {
  months: number[];
  startIndex: number;
  endIndex: number;
  onStartChange: (index: number) => void;
  onEndChange: (index: number) => void;
};

type ArchiveHeaderProps = {
  activeTab: ArchiveTab;
  isImporting: boolean;
  onTabChange: (tab: ArchiveTab) => void;
  onImport: () => void;
};

export function ArchiveHeader({
  activeTab,
  isImporting,
  onTabChange,
  onImport,
}: ArchiveHeaderProps) {
  return (
    <header className="archive-header">
      <div className="archive-logo">
        <strong>Instagram Viewer</strong>
      </div>
      <div className="archive-view-tabs" role="tablist" aria-label="Photo view">
        <button
          className={`viewer-control${activeTab === "ribbon" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "ribbon"}
          onClick={() => onTabChange("ribbon")}
        >
          <MoveHorizontal size={22} aria-hidden="true" />
          Horizontal<span className="tab-view-suffix"> View</span>
        </button>
        <button
          className={`viewer-control${activeTab === "grid" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "grid"}
          onClick={() => onTabChange("grid")}
        >
          <Grid2X2 size={21} aria-hidden="true" />
          Grid<span className="tab-view-suffix"> View</span>
        </button>
        <button
          className={`viewer-control${activeTab === "slideshow" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "slideshow"}
          onClick={() => onTabChange("slideshow")}
        >
          <Play size={18} fill="currentColor" aria-hidden="true" />
          Slideshow
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
  );
}

type ArchiveControlBarProps = {
  dateRange: ArchiveDateRange;
  slideshow?: {
    dwellMs: number;
    transitionPreset: TransitionPreset;
    onDwellChange: (value: number) => void;
    onTransitionPresetChange: (value: TransitionPreset) => void;
  };
};

const PRESETS: Array<{ value: TransitionPreset; label: string }> = [
  { value: "crossfade", label: "Crossfade" },
  { value: "directional-wipe", label: "Directional wipe" },
  { value: "depth-zoom", label: "Depth zoom" },
  { value: "film-burn", label: "Film burn" },
  { value: "rgb-split", label: "RGB split" },
  { value: "ken-burns", label: "Ken Burns" },
];

export function ArchiveControlBar({
  dateRange,
  slideshow,
}: ArchiveControlBarProps) {
  const { months, startIndex, endIndex, onStartChange, onEndChange } =
    dateRange;
  const maximum = Math.max(0, months.length - 1);
  const startPercent = maximum ? (startIndex / maximum) * 100 : 0;
  const endPercent = maximum ? (endIndex / maximum) * 100 : 100;
  const rangeStyle = {
    "--range-start": `${startPercent}%`,
    "--range-end": `${endPercent}%`,
  } as CSSProperties;

  return (
    <footer className="archive-dock">
      <div className="archive-date-range">
        <span className="archive-date-value" aria-hidden="true">
          Start time
          <strong>{formatMonth(months[startIndex])}</strong>
        </span>
        <div className="archive-dual-range" style={rangeStyle}>
          <span className="archive-range-track" aria-hidden="true" />
          <input
            type="range"
            aria-label="Start time"
            min={0}
            max={maximum}
            step={1}
            value={startIndex}
            disabled={maximum === 0}
            onChange={(event) =>
              onStartChange(Math.min(Number(event.target.value), endIndex))
            }
          />
          <input
            type="range"
            aria-label="End time"
            min={0}
            max={maximum}
            step={1}
            value={endIndex}
            disabled={maximum === 0}
            onChange={(event) =>
              onEndChange(Math.max(Number(event.target.value), startIndex))
            }
          />
        </div>
        <span className="archive-date-value is-end" aria-hidden="true">
          End time
          <strong>{formatMonth(months[endIndex])}</strong>
        </span>
      </div>

      {slideshow ? (
        <div className="slideshow-inline-settings">
          <label>
            <span>Transition style</span>
            <select
              aria-label="Transition style"
              value={slideshow.transitionPreset}
              onChange={(event) =>
                slideshow.onTransitionPresetChange(
                  event.target.value as TransitionPreset,
                )
              }
            >
              {PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="slideshow-duration">
            <span>Frame duration</span>
            <input
              type="range"
              aria-label="Frame duration"
              min={3000}
              max={10000}
              step={500}
              value={slideshow.dwellMs}
              onChange={(event) =>
                slideshow.onDwellChange(Number(event.target.value))
              }
            />
            <output>{formatDuration(slideshow.dwellMs)}</output>
          </label>
        </div>
      ) : null}
    </footer>
  );
}

function formatMonth(value?: number): string {
  if (value === undefined) return "No dates";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatDuration(value: number): string {
  const seconds = value / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}
