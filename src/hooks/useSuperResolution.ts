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
    usePersonFocus.setState((s) => ({ enhancing: s.enhancing + 1 }));
    let pending = true;
    const finish = () => {
      if (!pending) return;
      pending = false;
      usePersonFocus.setState((s) => ({
        enhancing: Math.max(0, s.enhancing - 1),
      }));
    };
    setResult({ source: url });
    void enhancePhoto(
      url,
      controller.signal,
      () => {},
      ref.current ?? undefined,
    ).then((value) => {
      finish();
      if (!controller.signal.aborted) {
        setResult({ source: url, ...value });
        if (value.error)
          usePersonFocus.setState({ enhancementError: value.error });
      }
    });
    return () => {
      controller.abort();
      finish();
    };
  }, [enabled, visible, ready, url]);
  return enabled && ready && result?.source === url ? result : undefined;
}
