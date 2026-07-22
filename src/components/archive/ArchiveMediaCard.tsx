import { ImageOff, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { getInstagramEmbedUrl } from "../../features/embed/instagramEmbedUrl";
import type { MediaQueueItem } from "../../features/media/mediaQueue";

const resolvedCandidateByRevision = new Map<string, string>();
const failedDirectMediaRevisions = new Set<string>();
const failedEmbedMediaRevisions = new Set<string>();
const MAX_CONCURRENT_EMBED_REQUESTS = 2;
const EMBED_REQUEST_TIMEOUT_MS = 12_000;
let activeEmbedRequests = 0;
const pendingEmbedRequests: EmbedRequest[] = [];

type EmbedRequest = {
  cancelled: boolean;
  granted: boolean;
  onGrant: () => void;
};

type ArchiveMediaCardProps = {
  item: MediaQueueItem;
  index: number;
  selected: boolean;
  allowCompatibilityPreview: boolean;
  layoutStyle: CSSProperties;
  onSelect: () => void;
};

export function ArchiveMediaCard({
  item,
  index,
  selected,
  allowCompatibilityPreview,
  layoutStyle,
  onSelect,
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
  const resolvedUrl = candidateUrls[candidateIndex];

  useEffect(() => {
    const cached = resolvedCandidateByRevision.get(mediaRevision);
    const nextIndex = cached ? candidateUrls.indexOf(cached) : 0;
    const failed = failedDirectMediaRevisions.has(mediaRevision);
    setCandidateIndex(Math.max(0, nextIndex));
    setIsLoading(candidateUrls.length > 0 && !cached && !failed);
    setHasFailed(failed);
  }, [candidateUrls, mediaRevision]);

  function handleImageError() {
    if (candidateIndex + 1 < candidateUrls.length) {
      setCandidateIndex((value) => value + 1);
      setIsLoading(true);
      return;
    }
    setIsLoading(false);
    setHasFailed(true);
    failedDirectMediaRevisions.add(mediaRevision);
  }

  function selectFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <motion.article
      className={`archive-card${selected ? " is-selected" : ""}`}
      data-media-id={media.id}
      data-media-index={index}
      data-testid="archive-media-card"
      style={layoutStyle}
      initial={{ opacity: 0, y: 55, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.62,
        delay: Math.min((index % 12) * 0.025, 0.22),
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -10, scale: 1.015 }}
    >
      <div
        className="archive-card-hit"
        role="button"
        tabIndex={0}
        aria-label={`View photo from ${creator}`}
        onClick={onSelect}
        onKeyDown={selectFromKeyboard}
      >
        <div className="archive-media-surface">
          {resolvedUrl && !hasFailed ? (
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
          ) : hasFailed ? (
            <div
              className="archive-media-unavailable"
              role="img"
              aria-label="Photo unavailable"
            >
              <ImageOff size={26} aria-hidden="true" />
            </div>
          ) : allowCompatibilityPreview ? (
            <CroppedInstagramPreview item={item} />
          ) : null}
        </div>
      </div>
    </motion.article>
  );
}

function CroppedInstagramPreview({ item }: { item: MediaQueueItem }) {
  const embedUrl = getInstagramEmbedUrl(item.post);
  const embedRevision = `${item.media.id}\u0000${embedUrl}`;
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(() =>
    failedEmbedMediaRevisions.has(embedRevision),
  );
  const { granted, release } = useEmbedRequestPermit(
    embedUrl,
    !hasFailed,
  );

  useEffect(() => {
    const failed = failedEmbedMediaRevisions.has(embedRevision);
    setHasFailed(failed);
    setIsLoading(!failed);
  }, [embedRevision]);
  useEffect(() => {
    if (!granted || !isLoading || hasFailed) return undefined;
    const timeout = window.setTimeout(() => {
      failedEmbedMediaRevisions.add(embedRevision);
      setHasFailed(true);
      setIsLoading(false);
      release();
    }, EMBED_REQUEST_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [embedRevision, granted, hasFailed, isLoading, release]);

  return (
    <div className="archive-embed-crop">
      {hasFailed ? (
        <div
          className="archive-media-unavailable"
          role="img"
          aria-label="Photo unavailable"
        >
          <ImageOff size={26} aria-hidden="true" />
        </div>
      ) : isLoading ? (
        <MediaLoadingState className="archive-embed-loading" />
      ) : null}
      {granted && !hasFailed ? (
        <iframe
          src={embedUrl}
          title={`Instagram photo preview ${item.post.shortcode ?? item.post.id}`}
          loading="lazy"
          scrolling="no"
          tabIndex={-1}
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            setIsLoading(false);
            release();
          }}
          onError={() => {
            failedEmbedMediaRevisions.add(embedRevision);
            setHasFailed(true);
            setIsLoading(false);
            release();
          }}
        />
      ) : null}
    </div>
  );
}

function useEmbedRequestPermit(key: string, enabled: boolean) {
  const [granted, setGranted] = useState(false);
  const releaseRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    setGranted(false);
    if (!enabled) {
      releaseRef.current = () => undefined;
      return undefined;
    }
    releaseRef.current = acquireEmbedRequest(() => setGranted(true));
    return () => releaseRef.current();
  }, [enabled, key]);

  const release = useCallback(() => {
    releaseRef.current();
    releaseRef.current = () => undefined;
  }, []);

  return { granted, release };
}

function acquireEmbedRequest(onGrant: () => void): () => void {
  const request: EmbedRequest = {
    cancelled: false,
    granted: false,
    onGrant,
  };
  pendingEmbedRequests.push(request);
  drainEmbedRequests();

  return () => {
    if (request.cancelled) return;
    request.cancelled = true;
    if (request.granted) {
      request.granted = false;
      activeEmbedRequests = Math.max(0, activeEmbedRequests - 1);
      drainEmbedRequests();
    }
  };
}

function drainEmbedRequests() {
  while (
    activeEmbedRequests < MAX_CONCURRENT_EMBED_REQUESTS &&
    pendingEmbedRequests.length > 0
  ) {
    const request = pendingEmbedRequests.shift();
    if (!request || request.cancelled) continue;
    request.granted = true;
    activeEmbedRequests += 1;
    request.onGrant();
  }
}

function MediaLoadingState({ className }: { className: string }) {
  return (
    <span className={className} role="status" aria-label="Loading photo">
      <LoaderCircle size={22} className="spin" aria-hidden="true" />
    </span>
  );
}
