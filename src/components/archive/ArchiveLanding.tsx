import { ArrowRight, Images, ShieldCheck, Upload } from "lucide-react";
import { useState } from "react";
import { LocalServiceButton } from "./LocalServiceSettings";
import "./ArchiveLanding.css";

type ArchiveLandingProps = {
  isImporting: boolean;
  error?: string;
  onChooseFile: () => void;
  onFile: (file: File) => void;
  onDemo: () => void;
};

export function ArchiveLanding({
  isImporting,
  error,
  onChooseFile,
  onFile,
  onDemo,
}: ArchiveLandingProps) {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <section
      className={`collection-landing${isDragging ? " is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (!isImporting && file?.name.toLowerCase().endsWith(".json"))
          onFile(file);
      }}
    >
      <header className="collection-header">
        <a
          className="collection-brand archive-logo"
          href={import.meta.env.BASE_URL}
          aria-label="Instagram Viewer home"
        >
          <Images size={22} /> <strong>Instagram Viewer</strong>
        </a>
        <LocalServiceButton />
      </header>
      <main className="collection-hero">
        <div className="collection-intro">
          <span className="collection-eyebrow">
            <span /> A SPACE FOR YOUR SAVED FINDS
          </span>
          <h1 aria-label="Instagram Viewer">
            <span>Instagram</span>
            <span>Viewer</span>
          </h1>
          <p className="collection-tagline">
            Less scrolling.
            <br />
            More inspiration.
          </p>
          <p className="collection-description">
            Give your saved posts a little room. Turn your Instagram collection
            into a photo gallery made for getting lost in.
          </p>
          <div className="collection-actions">
            <button
              type="button"
              className="viewer-control is-active"
              onClick={onDemo}
              disabled={isImporting}
            >
              View demo <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="viewer-control"
              onClick={onChooseFile}
              disabled={isImporting}
              aria-label="Choose Instagram saved posts JSON file"
            >
              <Upload size={17} aria-hidden="true" />
              {isImporting ? "Building preview…" : "Import saved posts"}
            </button>
          </div>
          <p className="collection-hint">
            Or drop your saved posts JSON anywhere here.
          </p>
          {error ? (
            <p className="collection-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div
          className="collection-preview"
          aria-label="Sample photo collection"
        >
          <div className="collection-preview-top">
            <span>
              <span className="collection-dot" /> THE DEMO COLLECTION
            </span>
            <span>01 / 10</span>
          </div>
          <div className="collection-photo-grid">
            <img
              className="collection-photo-main"
              src={`${import.meta.env.BASE_URL}demo/warm-interior.webp`}
              alt="Books stacked beside a sunlit window"
            />
            <img
              src={`${import.meta.env.BASE_URL}demo/mountain-light.webp`}
              alt="Mountain scenery from the demo collection"
            />
            <img
              src={`${import.meta.env.BASE_URL}demo/editorial-street.webp`}
              alt="A street scene from the demo collection"
            />
            <img
              src={`${import.meta.env.BASE_URL}demo/desert-road.webp`}
              alt="Layers of mountains in warm evening light"
            />
            <img
              src={`${import.meta.env.BASE_URL}demo/city-night.webp`}
              alt="City lights from the demo collection"
            />
          </div>
          <div className="collection-preview-bottom">
            <span>A few things worth saving.</span>
            <button
              type="button"
              onClick={onDemo}
              disabled={isImporting}
              className="viewer-control"
              aria-label="Explore demo collection"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </main>
      <footer className="collection-footer">
        <span>
          <ShieldCheck size={15} aria-hidden="true" /> Imported JSON stays in
          this browser.
        </span>
        <span>Horizontal · Grid · Slideshow</span>
      </footer>
      {isDragging ? (
        <div className="collection-drop">
          Drop your JSON to start your collection
        </div>
      ) : null}
    </section>
  );
}
