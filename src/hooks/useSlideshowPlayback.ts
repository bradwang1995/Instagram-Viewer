import { useEffect, useRef, useState } from "react";

export function useSlideshowPlayback(
  enabled: boolean,
  itemId: string | undefined,
  ready: boolean,
  dwellMs: number,
  onAdvance: () => void,
) {
  const [visible, setVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const advance = useRef(onAdvance);
  advance.current = onAdvance;
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!enabled || !visible || !ready || !itemId) return;
    // Start a full dwell only once the current image is usable; resume with a full dwell.
    const timer = window.setTimeout(() => advance.current(), dwellMs);
    return () => window.clearTimeout(timer);
  }, [enabled, visible, ready, itemId, dwellMs]);
  return visible;
}
