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
import { getInstagramEmbedUrl } from "../../features/embed/instagramEmbedUrl";
import { getInstagramEmbedAvailability } from "../../features/embed/instagramOEmbed";
import type { MediaQueueItem } from "../../features/media/mediaQueue";

const resolvedCandidateByRevision = new Map<string, string>();
const failedDirectMediaRevisions = new Set<string>();
const failedEmbedMediaRevisions = new Set<string>();

export type IframeStatus = "not-activated" | "loading" | "loaded" | "error";

type ArchiveMediaCardProps = {
  item: MediaQueueItem;
  index: number;
  selected: boolean;
  loadMedia?: boolean;
  allowCompatibilityPreview: boolean;
  layoutStyle: CSSProperties;
  visuallyHidden?: boolean;
  iframeStatus?: IframeStatus;
  registerShell?: (itemId: string, node: HTMLElement | null) => void;
  onIframeLoad?: (itemId: string) => void;
  onIframeError?: (itemId: string) => void;
  onSelect: (mediaId: string) => void;
  onUnavailable: (mediaId: string) => void;
};

export const ArchiveMediaCard = memo(function ArchiveMediaCard({
  item,
  index,
  selected,
  loadMedia = true,
  allowCompatibilityPreview,
  layoutStyle,
  visuallyHidden = false,
  iframeStatus,
  registerShell,
  onIframeLoad,
  onIframeError,
  onSelect,
  onUnavailable,
}: ArchiveMediaCardProps) {
  const { media, post } = item;
  const mediaRevision = `${media.id}\u0000${media.assetUrl ?? ""}\u0000${media.previewUrl ?? ""}`;
  const creator =
    media.creatorHandle ?? post.embedAuthorName ?? "Instagram photo";
  const candidateUrls = useMemo(
    () =>
      Array.from(
        new Set(
          [media.assetUrl, media.previewUrl].filter((value): value is string =>
            Boolean(value),
          ),
        ),
      ),
    [media.assetUrl, media.previewUrl],
  );
  const cachedCandidate = resolvedCandidateByRevision.get(mediaRevision);
  const [candidateIndex, setCandidateIndex] = useState(() =>
    Math.max(0, cachedCandidate ? candidateUrls.indexOf(cachedCandidate) : 0),
  );
  const [isLoading, setIsLoading] = useState(
    candidateUrls.length > 0 && !cachedCandidate,
  );
  const [hasFailed, setHasFailed] = useState(() =>
    failedDirectMediaRevisions.has(mediaRevision),
  );
  const [internalIframeStatus, setInternalIframeStatus] =
    useState<IframeStatus>("loading");
  const unavailableReportedRef = useRef(false);
  const resolvedUrl = candidateUrls[candidateIndex];
  const effectiveIframeStatus = iframeStatus ?? internalIframeStatus;
  const shellRef = useCallback(
    (node: HTMLElement | null) => registerShell?.(media.id, node),
    [media.id, registerShell],
  );
  const handleIframeLoad = useCallback(() => {
    if (onIframeLoad) onIframeLoad(media.id);
    else setInternalIframeStatus("loaded");
  }, [media.id, onIframeLoad]);
  const handleIframeError = useCallback(() => {
    if (onIframeError) onIframeError(media.id);
    else setInternalIframeStatus("error");
  }, [media.id, onIframeError]);

  useEffect(() => {
    const cached = resolvedCandidateByRevision.get(mediaRevision);
    const nextIndex = cached ? candidateUrls.indexOf(cached) : 0;
    const failed = failedDirectMediaRevisions.has(mediaRevision);
    setCandidateIndex(Math.max(0, nextIndex));
    setIsLoading(candidateUrls.length > 0 && !cached && !failed);
    setHasFailed(failed);
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
    failedDirectMediaRevisions.add(mediaRevision);
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
      <div className="archive-card-hit" onClick={() => onSelect(media.id)}>
        <div className="archive-media-surface">
          {loadMedia && resolvedUrl && !hasFailed ? (
            <>
              <img
                key={resolvedUrl}
                src={resolvedUrl}
                alt={media.caption ?? `${creator} saved photo`}
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
                draggable={false}
                onLoad={() => {
                  resolvedCandidateByRevision.set(mediaRevision, resolvedUrl);
                  failedDirectMediaRevisions.delete(mediaRevision);
                  setIsLoading(false);
                }}
                onError={handleImageError}
              />
              {isLoading ? (
                <MediaLoadingState className="archive-image-loading" />
              ) : null}
            </>
          ) : loadMedia && allowCompatibilityPreview ? (
            <CroppedInstagramPreview
              item={item}
              status={effectiveIframeStatus}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              onUnavailable={reportUnavailable}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
});

function CroppedInstagramPreview({
  item,
  status,
  onLoad,
  onError,
  onUnavailable,
}: {
  item: MediaQueueItem;
  status: IframeStatus;
  onLoad: () => void;
  onError: () => void;
  onUnavailable: () => void;
}) {
  const embedUrl = getInstagramEmbedUrl(item.post);
  const embedRevision = `${item.media.id}\u0000${embedUrl}`;
  const [hasFailed, setHasFailed] = useState(() =>
    failedEmbedMediaRevisions.has(embedRevision),
  );
  const [isValidated, setIsValidated] = useState(false);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    const failed = failedEmbedMediaRevisions.has(embedRevision);
    setHasFailed(failed);
    setIsValidated(false);
    if (failed) onUnavailableRef.current();
  }, [embedRevision]);

  const markUnavailable = useCallback(() => {
    failedEmbedMediaRevisions.add(embedRevision);
    setHasFailed(true);
    setIsValidated(false);
    onUnavailableRef.current();
  }, [embedRevision]);

  useEffect(() => {
    if (hasFailed) return undefined;
    let active = true;
    void getInstagramEmbedAvailability(item.post.canonicalUrl).then(
      (availability) => {
        if (!active) return;
        if (availability === "unavailable") {
          markUnavailable();
          return;
        }
        setIsValidated(true);
      },
    );
    return () => {
      active = false;
    };
  }, [hasFailed, item.post.canonicalUrl, markUnavailable]);

  if (hasFailed) return null;

  return (
    <div className="archive-embed-crop" data-load-state={status}>
      <MediaLoadingState
        className="archive-embed-loading"
        isVisible={status === "loading"}
      />
      {isValidated ? (
        <PersistentInstagramIframe
          key={item.media.id}
          itemId={item.media.id}
          embedUrl={embedUrl}
          title={`Instagram photo preview ${item.post.shortcode ?? item.post.id}`}
          ready={status === "loaded"}
          onLoad={onLoad}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

const PersistentInstagramIframe = memo(function PersistentInstagramIframe({
  itemId,
  embedUrl,
  title,
  ready,
  onLoad,
  onError,
}: {
  itemId: string;
  embedUrl: string;
  title: string;
  ready: boolean;
  onLoad: () => void;
  onError: () => void;
}) {
  return (
    <iframe
      className={ready ? "is-ready" : undefined}
      data-instagram-id={itemId}
      src={embedUrl}
      title={title}
      loading="eager"
      scrolling="no"
      tabIndex={-1}
      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={onLoad}
      onError={onError}
    />
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
