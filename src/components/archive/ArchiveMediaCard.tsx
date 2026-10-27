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
import { getMediaUrl } from "../../features/media/instagramMedia";
import type { MediaQueueItem } from "../../features/media/mediaQueue";

const resolvedCandidateByRevision = new Map<string, string>();

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
  const url = getMediaUrl(item);
  const mediaRevision = `${media.id}\u0000${media.assetUrl ?? ""}\u0000${media.previewUrl ?? ""}`;
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
  const resolvedUrl = candidateUrls[candidateIndex];
  const shellRef = useCallback(
    (node: HTMLElement | null) => registerShell?.(media.id, node),
    [media.id, registerShell],
  );

  useEffect(() => {
    const cached = resolvedCandidateByRevision.get(mediaRevision);
    const nextIndex = cached ? candidateUrls.indexOf(cached) : 0;
    setCandidateIndex(Math.max(0, nextIndex));
    setIsLoading(candidateUrls.length > 0 && !cached);
    setHasFailed(false);
    unavailableReportedRef.current = false;
  }, [candidateUrls, mediaRevision]);

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

  if (hasFailed) return null;

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
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(media.id);
          }
        }}
      >
        <div className="archive-media-surface">
          {loadMedia && resolvedUrl && !hasFailed ? (
            <>
              <img
                key={resolvedUrl}
                src={resolvedUrl}
                data-media-id={media.id}
                alt={media.caption ?? `${creator} saved photo`}
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
                draggable={false}
                onLoad={() => {
                  resolvedCandidateByRevision.set(mediaRevision, resolvedUrl);
                  setIsLoading(false);
                }}
                onError={handleImageError}
              />
              {isLoading ? (
                <MediaLoadingState className="archive-image-loading" />
              ) : null}
            </>
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
