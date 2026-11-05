import { useEffect, useState, type RefObject } from "react";
import { usePersonFocus } from "../features/media/personFocus";
import { enhancePhoto } from "../features/media/superResolution";

export function useSuperResolution(
  ref: RefObject<HTMLImageElement>,
  url: string | undefined,
  ready: boolean,
) {
  const enabled = usePersonFocus((s) => s.superResolution);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<{
    source: string;
    url?: string;
    error?: string;
    progress?: number;
  }>();
  useEffect(() => {
    const image = ref.current;
    if (!enabled || !ready || !image) {
      setVisible(false);
      return;
    }
    const observer = new IntersectionObserver((entries) =>
      setVisible(entries.some((entry) => entry.isIntersecting)),
    );
    observer.observe(image.parentElement ?? image);
    return () => observer.disconnect();
  }, [enabled, ready, ref, url]);
  useEffect(() => {
    if (!enabled || !visible || !ready || !url) return;
    const controller = new AbortController();
    setResult({ source: url, progress: 0 });
    void enhancePhoto(url, controller.signal, (progress) => {
      if (!controller.signal.aborted) setResult({ source: url, progress });
    }).then((value) => {
      if (!controller.signal.aborted) setResult({ source: url, ...value });
    });
    return () => controller.abort();
  }, [enabled, visible, ready, url]);
  return enabled && ready && result?.source === url ? result : undefined;
}
