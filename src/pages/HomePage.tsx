import {
  ArchiveRestore,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Image,
  Pause,
  Play,
  Search,
  Shuffle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/common/Button";
import { InstagramBlockquoteEmbed } from "../components/posts/InstagramBlockquoteEmbed";
import { clearLocalDatabase } from "../db/postRepository";
import type { ImportJob, SavedPost } from "../db/schema";
import { downloadAppBackup } from "../features/backup/exportBackup";
import { importAppBackupFile } from "../features/backup/importBackup";
import { importSavedPostsJsonFile } from "../features/import/importJson";
import { EMPTY_FILTERS, filterPosts } from "../features/library/postFilters";
import { sortPosts } from "../features/library/postSort";
import { getAdjacentItemId } from "../features/slideshow/navigation";
import { shuffleArray } from "../features/slideshow/shuffle";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { usePosts } from "../hooks/usePosts";
import { formatDateTime } from "../utils/date";

const PAGE_SIZE = 20;

export function HomePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { posts, isLoading, error, refresh } = usePosts();
  const [latestJob, setLatestJob] = useState<ImportJob>();
  const [isImporting, setIsImporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [intervalMs, setIntervalMs] = useState(6000);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredPosts = useMemo(() => {
    const filtered = filterPosts(posts, {
      ...EMPTY_FILTERS,
      searchQuery: query,
      dateFrom,
      dateTo,
      includeHidden: true,
    });

    return sortPosts(filtered, "newest_saved");
  }, [dateFrom, dateTo, posts, query]);

  const playbackPosts = useMemo(
    () => (isShuffle ? shuffleArray(filteredPosts) : filteredPosts),
    [filteredPosts, isShuffle, shuffleSeed],
  );
  const playbackIds = useMemo(
    () => playbackPosts.map((post) => post.id),
    [playbackPosts],
  );
  const selectedPost =
    playbackPosts.find((post) => post.id === selectedPostId) ?? playbackPosts[0];
  const selectedIndex = selectedPost
    ? playbackIds.indexOf(selectedPost.id)
    : -1;
  const loadedPosts = filteredPosts.slice(0, visibleCount);
  const hasMore = loadedPosts.length < filteredPosts.length;
  const hasFilters = Boolean(query || dateFrom || dateTo);

  const goNext = useCallback(() => {
    setSelectedPostId((currentId) =>
      getAdjacentItemId(playbackIds, currentId ?? selectedPost?.id, 1),
    );
  }, [playbackIds, selectedPost?.id]);

  const goPrevious = useCallback(() => {
    setSelectedPostId((currentId) =>
      getAdjacentItemId(playbackIds, currentId ?? selectedPost?.id, -1),
    );
  }, [playbackIds, selectedPost?.id]);

  useEffect(() => {
    if (!selectedPostId || !playbackIds.includes(selectedPostId)) {
      setSelectedPostId(playbackIds[0]);
    }
  }, [playbackIds, selectedPostId]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setIsPlaying(false);
  }, [dateFrom, dateTo, query]);

  useEffect(() => {
    if (!selectedPost) {
      return;
    }

    const libraryIndex = filteredPosts.findIndex((post) => post.id === selectedPost.id);
    if (libraryIndex >= visibleCount) {
      setVisibleCount(Math.ceil((libraryIndex + 1) / PAGE_SIZE) * PAGE_SIZE);
    }
  }, [filteredPosts, selectedPost, visibleCount]);

  useEffect(() => {
    if (!isPlaying || playbackIds.length < 2) {
      return undefined;
    }

    const timer = window.setTimeout(goNext, intervalMs);
    return () => window.clearTimeout(timer);
  }, [goNext, intervalMs, isPlaying, playbackIds.length, selectedPostId]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredPosts.length));
        }
      },
      { rootMargin: "100px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredPosts.length, hasMore]);

  useKeyboardShortcuts({
    ArrowRight: goNext,
    ArrowLeft: goPrevious,
    " ": (event) => {
      event.preventDefault();
      setIsPlaying((value) => !value);
    },
    Escape: () => setIsPlaying(false),
  });

  async function importJson(file: File | undefined) {
    if (!file) return;
    setIsImporting(true);
    setActionMessage("");
    setActionError("");

    try {
      const job = await importSavedPostsJsonFile(file);
      setLatestJob(job);
      await refresh();
      setSelectedPostId(undefined);
      setVisibleCount(PAGE_SIZE);
    } catch (caughtError) {
      setActionError(getErrorMessage(caughtError, "Could not import that JSON file."));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function exportBackup() {
    setActionMessage("");
    setActionError("");

    try {
      await downloadAppBackup();
      setActionMessage("Backup downloaded.");
    } catch (caughtError) {
      setActionError(getErrorMessage(caughtError, "Could not create the backup."));
    }
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    setIsRestoring(true);
    setActionMessage("");
    setActionError("");

    try {
      const backup = await importAppBackupFile(file);
      await refresh();
      setLatestJob(undefined);
      setSelectedPostId(undefined);
      setVisibleCount(PAGE_SIZE);
      setActionMessage(
        `Restored ${backup.posts.length.toLocaleString()} saved photos.`,
      );
    } catch (caughtError) {
      setActionError(getErrorMessage(caughtError, "Could not restore that backup."));
    } finally {
      setIsRestoring(false);
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  async function clearLibrary() {
    if (!window.confirm("Clear the local library in this browser? Instagram is not affected.")) {
      return;
    }

    await clearLocalDatabase();
    setLatestJob(undefined);
    setActionMessage("");
    setActionError("");
    setSelectedPostId(undefined);
    setIsPlaying(false);
    await refresh();
  }

  function selectPost(post: SavedPost) {
    setSelectedPostId(post.id);
    stageRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function clearFilters() {
    setQuery("");
    setDateFrom("");
    setDateTo("");
  }

  function toggleShuffle() {
    setShuffleSeed((value) => value + 1);
    setIsShuffle((value) => !value);
  }

  return (
    <div className="gallery-page">
      <section className="gallery-heading">
        <div>
          <span className="eyebrow">Private, local collection</span>
          <h1>Saved photo gallery</h1>
          <p>{posts.length.toLocaleString()} saved photos stored in this browser.</p>
        </div>
        <div className="gallery-heading-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void importJson(event.target.files?.[0])}
          />
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="Restore backup file"
            hidden
            onChange={(event) => void restoreBackup(event.target.files?.[0])}
          />
          <Button variant="primary" disabled={isImporting} onClick={() => fileInputRef.current?.click()}>
            <Upload size={17} aria-hidden="true" />
            {isImporting ? "Importing..." : posts.length ? "Import again" : "Import JSON"}
          </Button>
          <Button
            className="icon-button"
            variant="ghost"
            disabled={isRestoring}
            onClick={() => backupInputRef.current?.click()}
            aria-label="Restore backup"
            title="Restore backup"
          >
            <ArchiveRestore size={17} aria-hidden="true" />
          </Button>
          {posts.length > 0 ? (
            <Button
              className="icon-button"
              variant="ghost"
              onClick={() => void exportBackup()}
              aria-label="Download backup"
              title="Download backup"
            >
              <Download size={17} aria-hidden="true" />
            </Button>
          ) : null}
          {posts.length > 0 ? (
            <Button className="icon-button" variant="ghost" onClick={clearLibrary} aria-label="Clear library" title="Clear library">
              <Trash2 size={17} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </section>

      {latestJob ? <ImportNote job={latestJob} /> : null}
      {actionMessage ? <p className="success-text">{actionMessage}</p> : null}
      {error || actionError ? <p className="error-text">{actionError || error}</p> : null}
      {isLoading ? <div className="loading-state">Loading your gallery...</div> : null}

      {!isLoading && posts.length === 0 ? (
        <section className="gallery-empty">
          <Image size={34} aria-hidden="true" />
          <h2>Bring in your saved photos</h2>
          <p>Select Instagram's <code>saved_posts.json</code>. The file stays on this device.</p>
          <div className="gallery-empty-actions">
            <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={17} aria-hidden="true" />
              Choose JSON file
            </Button>
            <Button variant="secondary" disabled={isRestoring} onClick={() => backupInputRef.current?.click()}>
              <ArchiveRestore size={17} aria-hidden="true" />
              {isRestoring ? "Restoring..." : "Restore backup"}
            </Button>
          </div>
        </section>
      ) : null}

      {posts.length > 0 ? (
        <>
          <section className="gallery-filters" aria-label="Gallery filters">
            <label className="gallery-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search saved photos</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shortcode or collection" />
            </label>

            <div className="date-filters">
              <CalendarDays size={17} aria-hidden="true" />
              <label>
                <span>From</span>
                <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} />
              </label>
              <label>
                <span>To</span>
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} />
              </label>
            </div>

            {hasFilters ? (
              <Button className="icon-button" variant="ghost" onClick={clearFilters} aria-label="Clear filters" title="Clear filters">
                <X size={17} aria-hidden="true" />
              </Button>
            ) : null}
          </section>

          <section className="gallery-layout">
            <section className="viewer-panel" ref={stageRef} aria-label="Selected Instagram post">
              {selectedPost ? (
                <>
                  <div className="viewer-toolbar">
                    <div className="viewer-identity">
                      <span className="media-badge">Photo</span>
                      <div>
                        <strong>{selectedPost.shortcode}</strong>
                        <small>{formatDateTime(selectedPost.savedAt ?? selectedPost.importedAt)}</small>
                      </div>
                    </div>
                    <span className="viewer-counter">
                      {selectedIndex + 1} / {playbackPosts.length.toLocaleString()}
                    </span>
                  </div>

                  <InstagramBlockquoteEmbed key={selectedPost.id} post={selectedPost} />

                  <div className="playback-controls" aria-label="Slideshow controls">
                    <Button className="icon-button" onClick={goPrevious} disabled={playbackPosts.length < 2} aria-label="Previous post" title="Previous post">
                      <ChevronLeft size={20} aria-hidden="true" />
                    </Button>
                    <Button className="play-button" variant="primary" onClick={() => setIsPlaying((value) => !value)} disabled={playbackPosts.length < 2}>
                      {isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                      {isPlaying ? "Pause" : "Play"}
                    </Button>
                    <Button className="icon-button" onClick={goNext} disabled={playbackPosts.length < 2} aria-label="Next post" title="Next post">
                      <ChevronRight size={20} aria-hidden="true" />
                    </Button>
                    <Button className={`icon-button${isShuffle ? " active" : ""}`} onClick={toggleShuffle} disabled={playbackPosts.length < 2} aria-label="Shuffle playback" title="Shuffle playback" aria-pressed={isShuffle}>
                      <Shuffle size={18} aria-hidden="true" />
                    </Button>
                    <label className="interval-control">
                      <span>Advance</span>
                      <select value={intervalMs} onChange={(event) => setIntervalMs(Number(event.target.value))}>
                        <option value={6000}>6 sec</option>
                        <option value={10000}>10 sec</option>
                        <option value={15000}>15 sec</option>
                      </select>
                    </label>
                  </div>
                </>
              ) : (
                <div className="gallery-empty compact">
                  <Search size={28} aria-hidden="true" />
                  <h2>No matching saves</h2>
                  <p>Clear or adjust the filters to return to the gallery.</p>
                </div>
              )}
            </section>

            <aside className="library-panel" aria-label="Imported saved photos">
              <div className="library-heading">
                <div>
                  <h2>Library</h2>
                  <span>{filteredPosts.length.toLocaleString()} shown</span>
                </div>
                <span>{loadedPosts.length.toLocaleString()} loaded</span>
              </div>

              <div className="gallery-list">
                {loadedPosts.map((post, index) => (
                  <button
                    className={selectedPost?.id === post.id ? "gallery-list-item active" : "gallery-list-item"}
                    key={post.id}
                    onClick={() => selectPost(post)}
                    aria-current={selectedPost?.id === post.id ? "true" : undefined}
                  >
                    <span className="list-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="list-media">
                      <Image size={16} aria-hidden="true" />
                    </span>
                    <span className="list-copy">
                      <strong>{post.shortcode}</strong>
                      <small>{formatDateTime(post.savedAt ?? post.importedAt)}</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>

              {hasMore ? (
                <div className="load-more" ref={loadMoreRef}>
                  <Button variant="secondary" onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredPosts.length))}>
                    Load 20 more
                  </Button>
                  <small>More items load automatically as you scroll.</small>
                </div>
              ) : filteredPosts.length > 0 ? (
                <p className="list-end">End of collection</p>
              ) : null}
            </aside>
          </section>
        </>
      ) : null}
    </div>
  );
}

function ImportNote({ job }: { job: ImportJob }) {
  return (
    <section className={job.status === "failed" ? "import-note import-note-error" : "import-note"}>
      {job.status === "failed" ? (
        <strong>{job.error ?? "Import failed."}</strong>
      ) : (
        <strong>{job.totalUniquePostsFound.toLocaleString()} unique photos are ready.</strong>
      )}
      {job.warnings.length > 0 ? <span>{job.warnings.map((warning) => warning.message).join(" ")}</span> : null}
    </section>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
