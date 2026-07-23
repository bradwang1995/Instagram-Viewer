import { useGSAP } from "@gsap/react";
import { ArrowRight, ShieldCheck, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import gsap from "gsap";

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
  const rootRef = useRef<HTMLElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useGSAP(
    () => {
      gsap.fromTo(
        ".landing-wordmark span",
        { yPercent: 112 },
        {
          yPercent: 0,
          duration: 1.15,
          ease: "power4.out",
          stagger: 0.07,
        },
      );
      gsap.fromTo(
        ".landing-portrait",
        { clipPath: "inset(100% 0 0 0)", scale: 1.08 },
        {
          clipPath: "inset(0% 0 0 0)",
          scale: 1,
          duration: 1.4,
          ease: "power4.inOut",
          delay: 0.25,
        },
      );
      gsap.to(".landing-portrait img", {
        yPercent: -2.2,
        scale: 1.035,
        duration: 5.8,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    },
    { scope: rootRef },
  );

  function acceptFile(file?: File) {
    if (file?.name.toLowerCase().endsWith(".json")) onFile(file);
  }

  return (
    <section
      ref={rootRef}
      className={`archive-landing${isDragging ? " is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        acceptFile(event.dataTransfer.files[0]);
      }}
    >
      <header className="landing-header">
        <div className="archive-logo">
          <strong>Instagram Viewer</strong>
        </div>
        <span className="landing-step">01 — Import</span>
      </header>

      <h1 className="landing-wordmark" aria-label="Instagram Viewer">
        <span>INSTAGRAM</span>
        <span>VIEWER</span>
      </h1>

      <motion.button
        type="button"
        className="landing-portrait"
        onClick={onChooseFile}
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.99 }}
        aria-label="Choose Instagram saved posts JSON file"
      >
        <img
          src={`${import.meta.env.BASE_URL}demo/warm-interior.webp`}
          alt="A quiet interior preview representing the local photo collection"
        />
        <span className="landing-image-wash" aria-hidden="true" />
        <span className="landing-upload-copy">
          <span>
            {isImporting ? "Preparing your photos" : "Drop JSON or click"}
          </span>
          <strong>
            {isImporting ? "Building preview…" : "Import saved posts"}
            <Upload size={18} aria-hidden="true" />
          </strong>
        </span>
      </motion.button>

      <div className="landing-manifesto">
        <p>
          Your saved Instagram references become one private, scrollable image
          field. Imported JSON stays in this browser.
        </p>
        <span>JSON only · local browser storage</span>
      </div>

      <button className="landing-demo" type="button" onClick={onDemo}>
        View demo <ArrowRight size={18} aria-hidden="true" />
      </button>

      <span className="landing-private">
        <ShieldCheck size={14} aria-hidden="true" /> Local by design
      </span>

      {error ? <div className="landing-error">{error}</div> : null}
      {isDragging ? (
        <div className="landing-drop-state">Release to build your preview</div>
      ) : null}
    </section>
  );
}
