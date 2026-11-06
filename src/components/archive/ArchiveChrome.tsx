import { Grid2X2, MoveHorizontal, Play, Upload } from "lucide-react";
import { usePersonFocus } from "../../features/media/personFocus";
import type { CSSProperties } from "react";
import type { TransitionPreset } from "../../db/schema";
import type { ArchiveViewMode } from "./ArchivePreview";
import { LocalServiceButton } from "./LocalServiceSettings";

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
  photoLevel?: boolean;
  isImporting: boolean;
  onTabChange: (tab: ArchiveTab) => void;
  onImport: () => void;
};

export function ArchiveHeader({
  activeTab,
  photoLevel = false,
  isImporting,
  onTabChange,
  onImport,
}: ArchiveHeaderProps) {
  return (
    <header className="archive-header">
      <div className="archive-logo">
        <strong>{photoLevel ? "Post photos" : "Instagram Viewer"}</strong>
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
      {photoLevel ? (
        <span />
      ) : (
        <div
          style={{
            display: "flex",
            gap: 8,
            justifySelf: "end",
            alignItems: "center",
          }}
        >
          <LocalServiceButton />
          <button
            className="viewer-control archive-import-link"
            type="button"
            onClick={onImport}
          >
            <Upload size={18} aria-hidden="true" />
            {isImporting ? "Importing…" : "Import JSON"}
          </button>
        </div>
      )}
    </header>
  );
}

type ArchiveControlBarProps = {
  dateRange?: ArchiveDateRange;
  slideshow?: {
    dwellMs: number;
    transitionPreset: TransitionPreset;
    onDwellChange: (value: number) => void;
    onTransitionPresetChange: (value: TransitionPreset) => void;
  };
};

const PRESETS: Array<{
  value: TransitionPreset;
  label: string;
  description: string;
}> = [
  {
    value: "crossfade",
    label: "Crossfade",
    description: "One photo gently fades into the next.",
  },
  {
    value: "directional-wipe",
    label: "Directional wipe",
    description:
      "The next photo is revealed from left to right while staying in place.",
  },
  {
    value: "depth-zoom",
    label: "Depth zoom",
    description: "A soft zoom and blur bring the next photo into focus.",
  },
  {
    value: "film-burn",
    label: "Film burn",
    description: "A warm flash fades away like light leaking onto film.",
  },
  {
    value: "rgb-split",
    label: "RGB split",
    description:
      "Colorful cyan and magenta edges briefly separate for a glitch effect.",
  },
  {
    value: "ken-burns",
    label: "Ken Burns",
    description: "A slow, gentle zoom adds movement while each photo is shown.",
  },
];

export function ArchiveControlBar({
  dateRange,
  slideshow,
}: ArchiveControlBarProps) {
  const { strength, setStrength, autoRotate, peopleOnly } = usePersonFocus();
  const { months, startIndex, endIndex, onStartChange, onEndChange } =
    dateRange ?? {
      months: [],
      startIndex: 0,
      endIndex: 0,
      onStartChange: () => {},
      onEndChange: () => {},
    };
  const maximum = Math.max(0, months.length - 1);
  const startPercent = maximum ? (startIndex / maximum) * 100 : 0;
  const endPercent = maximum ? (endIndex / maximum) * 100 : 100;
  const rangeStyle = {
    "--range-start": `${startPercent}%`,
    "--range-end": `${endPercent}%`,
  } as CSSProperties;

  return (
    <footer className="archive-dock">
      {dateRange ? (
        <div className="archive-date-range">
          <span className="archive-date-value" aria-hidden="true">
            <span>Start time</span>
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
            <strong>{formatMonth(months[endIndex])}</strong>
            <span>End time</span>
          </span>
        </div>
      ) : null}

      {slideshow ? (
        <div className="slideshow-inline-settings">
          <label>
            <span>Transition style</span>
            <select
              aria-label="Transition style"
              title={PRESETS.map((p) => `${p.label}: ${p.description}`).join(
                "\n",
              )}
              value={slideshow.transitionPreset}
              onChange={(event) =>
                slideshow.onTransitionPresetChange(
                  event.target.value as TransitionPreset,
                )
              }
            >
              {PRESETS.map((preset) => (
                <option
                  key={preset.value}
                  value={preset.value}
                  title={preset.description}
                >
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
              min={2000}
              max={15000}
              step={1000}
              value={slideshow.dwellMs}
              onChange={(event) =>
                slideshow.onDwellChange(Number(event.target.value))
              }
            />
            <output>{formatDuration(slideshow.dwellMs)}</output>
          </label>
        </div>
      ) : (
        <div className="slideshow-settings-placeholder" />
      )}
      <div className="photo-view-controls">
        <label
          className="person-focus-slider"
          style={{ "--focus-strength": `${strength}%` } as CSSProperties}
        >
          <span>Focus on Person</span>
          <span className="person-focus-endpoint" aria-hidden="true">
            0%
          </span>
          <input
            type="range"
            aria-label="Focus on person"
            aria-valuetext={strength === 0 ? "Original" : `${strength}% focus`}
            min={0}
            max={100}
            step={1}
            value={strength}
            onChange={(event) => setStrength(Number(event.target.value))}
          />
          <span className="person-focus-endpoint" aria-hidden="true">
            100%
          </span>
        </label>
        <details
          className="view-options"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary className="viewer-control">View Options</summary>
          <div
            className="view-options-menu"
            role="group"
            aria-label="View Options"
          >
            <label
              className="view-option"
              title="Turn sideways people upright for easier viewing."
            >
              <span>Auto Rotate</span>
              <button
                type="button"
                role="switch"
                title="Turn sideways people upright for easier viewing."
                aria-label="Auto Rotate"
                aria-checked={autoRotate}
                className="view-option-switch"
                onClick={() =>
                  usePersonFocus.setState({ autoRotate: !autoRotate })
                }
              >
                <span aria-hidden="true" />
              </button>
            </label>
            <label
              className="view-option"
              title="Show only photos with people. Turn off to see all photos again."
            >
              <span>Human Only</span>
              <button
                type="button"
                role="switch"
                title="Show only photos with people. Turn off to see all photos again."
                aria-label="Human Only"
                aria-checked={peopleOnly}
                className="view-option-switch"
                onClick={() =>
                  usePersonFocus.setState({
                    peopleOnly: !peopleOnly,
                    detectionError: false,
                  })
                }
              >
                <span aria-hidden="true" />
              </button>
            </label>
          </div>
        </details>
      </div>
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
