import { LoaderCircle } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { resolveMediaUrl } from "../../features/media/instagramMedia";
import { createRequestQueue } from "../../features/media/requestQueue";
import type { MediaQueueItem } from "../../features/media/mediaQueue";

const resolvedCandidateByRevision = new Map<string, string>();
const resolveCover = createRequestQueue(2);

type ArchiveMediaCardProps = {
  item: MediaQueueItem;
  index: number;
  selected: boolean;
  loadMedia?: boolean;
  layoutStyle: CSSProperties;
  visuallyHidden?: boolean;
  registerShell?: (itemId: string, node: HTMLElement | null) => void;
  onSelect: (mediaId: string) => void;
  onUnavailable: (mediaId: string) => void;
};

export const ArchiveMediaCard = memo(function ArchiveMediaCard({
  item,
  index,
  selected,
  loadMedia = true,
  layoutStyle,
  visuallyHidden = false,
  registerShell,
  onSelect,
  onUnavailable,
}: ArchiveMediaCardProps) {
  const { media, post } = item;
  const [proxyUrl, setProxyUrl] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const directUrl = media.assetUrl ?? media.previewUrl;
  const url = directUrl ?? proxyUrl;
  const mediaRevision = `${media.id}\u0000${url ?? ""}\u0000${media.previewUrl ?? ""}`;
  const creator =
    media.creatorHandle ?? post.embedAuthorName ?? "Instagram photo";
  const candidateUrls = useMemo(
    () =>
      Array.from(
        new Set(
          [url, media.previewUrl].filter((value): value is string =>
            Boolean(value),
          ),
        ),
      ),
    [url, media.previewUrl],
  );
  const cachedCandidate = resolvedCandidateByRevision.get(mediaRevision);
  const [candidateIndex, setCandidateIndex] = useState(() =>
    Math.max(0, cachedCandidate ? candidateUrls.indexOf(cachedCandidate) : 0),
  );
  const [isLoading, setIsLoading] = useState(
    candidateUrls.length > 0 && !cachedCandidate,
  );
  const [hasFailed, setHasFailed] = useState(false);
  const unavailableReportedRef = useRef(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const resolvedUrl = candidateUrls[candidateIndex];
  const shellRef = useCallback(
    (node: HTMLElement | null) => registerShell?.(media.id, node),
    [media.id, registerShell],
  );

  useEffect(() => {
    const cached = resolvedCandidateByRevision.get(mediaRevision);
    const nextIndex = cached ? candidateUrls.indexOf(cached) : 0;
    setCandidateIndex(Math.max(0, nextIndex));
    const image = imageRef.current;
    const alreadyLoaded =
      image?.complete &&
      image.naturalWidth > 0 &&
      image.getAttribute("src") === candidateUrls[Math.max(0, nextIndex)];
    setIsLoading(candidateUrls.length > 0 && !cached && !alreadyLoaded);
    setHasFailed(false);
    unavailableReportedRef.current = false;
  }, [candidateUrls, mediaRevision]);

  useEffect(() => {
    if (!loadMedia || visuallyHidden || directUrl) return;
    const controller = new AbortController();
    setHasFailed(false);
    setIsLoading(true);
    void resolveCover(() => resolveMediaUrl(item), controller.signal)
      .then((source) => {
        if (controller.signal.aborted) return;
        setProxyUrl(source);
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          return;
        setHasFailed(true);
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [loadMedia, visuallyHidden, directUrl, item, attempt]);

  const reportUnavailable = useCallback(() => {
    if (unavailableReportedRef.current) return;
    unavailableReportedRef.current = true;
    onUnavailable(media.id);
  }, [media.id, onUnavailable]);

  useEffect(() => {
    if (hasFailed) reportUnavailable();
  }, [hasFailed, reportUnavailable]);

  function handleImageError() {
    if (candidateIndex + 1 < candidateUrls.length) {
      setCandidateIndex((value) => value + 1);
      setIsLoading(true);
      return;
    }
    setIsLoading(false);
    setHasFailed(true);
    reportUnavailable();
  }

  return (
    <article
      ref={shellRef}
      className={`archive-card${selected ? " is-selected" : ""}`}
      data-media-id={media.id}
      data-media-index={index}
      data-media-load={loadMedia ? "enabled" : "paused"}
      data-media-visibility={visuallyHidden ? "filtered" : "visible"}
      data-testid="archive-media-card"
      hidden={visuallyHidden}
      style={layoutStyle}
    >
      <div
        className="archive-card-hit"
        role="button"
        tabIndex={0}
        aria-label={`Open post ${post.shortcode ?? post.id}`}
        onClick={() => onSelect(media.id)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(media.id);
          }
        }}
      >
        <div className="archive-media-surface">
          {hasFailed ? (
            <div className="archive-photo-error" role="status">
              <span>Photo could not load.</span>
              <button
                className="viewer-control"
                onClick={(event) => {
                  event.stopPropagation();
                  unavailableReportedRef.current = false;
                  setHasFailed(false);
                  setIsLoading(true);
                  setAttempt((value) => value + 1);
                }}
              >
                Retry
              </button>
            </div>
          ) : loadMedia && resolvedUrl ? (
            <>
              <img
                ref={imageRef}
                key={resolvedUrl}
                src={resolvedUrl}
                data-media-id={media.id}
                alt={media.caption ?? `${creator} saved photo`}
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
                draggable={false}
                onLoad={() => {
                  if (resolvedCandidateByRevision.size > 200)
                    resolvedCandidateByRevision.delete(
                      resolvedCandidateByRevision.keys().next().value!,
                    );
                  resolvedCandidateByRevision.set(mediaRevision, resolvedUrl);
                  setIsLoading(false);
                }}
                onError={handleImageError}
              />
              {isLoading ? (
                <MediaLoadingState className="archive-image-loading" />
              ) : null}
            </>
          ) : loadMedia ? (
            <MediaLoadingState className="archive-image-loading" />
          ) : null}
        </div>
      </div>
    </article>
  );
});

function MediaLoadingState({
  className,
  isVisible = true,
}: {
  className: string;
  isVisible?: boolean;
}) {
  return (
    <span
      className={`${className}${isVisible ? "" : " is-hidden"}`}
      role={isVisible ? "status" : undefined}
      aria-label={isVisible ? "Loading photo" : undefined}
      aria-hidden={isVisible ? undefined : true}
    >
      <LoaderCircle size={22} className="spin" aria-hidden="true" />
    </span>
  );
}
