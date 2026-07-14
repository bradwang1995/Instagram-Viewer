import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { SavedPost } from "../db/schema";
import { Button } from "../components/common/Button";
import { SlideshowControls } from "../components/slideshow/SlideshowControls";
import { SlideshowViewer } from "../components/slideshow/SlideshowViewer";
import { shuffleArray } from "../features/slideshow/shuffle";
import { useSlideshowState } from "../features/slideshow/slideshowState";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { usePosts } from "../hooks/usePosts";

export function SlideshowPage() {
  const { posts, isLoading } = usePosts();
  const {
    currentSlideIndex,
    isPlaying,
    isShuffle,
    intervalMs,
    setCurrentSlideIndex,
    nextSlide,
    previousSlide,
    togglePlaying,
    setPlaying,
    toggleShuffle,
    setIntervalMs,
  } = useSlideshowState();
  const [orderedPosts, setOrderedPosts] = useState<SavedPost[]>([]);

  const sessionPostIds = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(
        "instagram-saved-viewer:slideshow-post-ids",
      );
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }, []);

  const basePosts = useMemo(() => {
    const visible = posts.filter((post) => !post.hidden);

    if (sessionPostIds.length === 0) {
      return visible;
    }

    const postById = new Map(visible.map((post) => [post.id, post]));
    return sessionPostIds
      .map((id) => postById.get(id))
      .filter((post): post is SavedPost => Boolean(post));
  }, [posts, sessionPostIds]);

  useEffect(() => {
    setOrderedPosts(isShuffle ? shuffleArray(basePosts) : basePosts);
    setCurrentSlideIndex(0);
  }, [basePosts, isShuffle, setCurrentSlideIndex]);

  useEffect(() => {
    if (!isPlaying || orderedPosts.length === 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      nextSlide(orderedPosts.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, isPlaying, nextSlide, orderedPosts.length]);

  useKeyboardShortcuts({
    ArrowRight: () => nextSlide(orderedPosts.length),
    ArrowLeft: () => previousSlide(orderedPosts.length),
    " ": (event) => {
      event.preventDefault();
      togglePlaying();
    },
    s: () => toggleShuffle(),
    S: () => toggleShuffle(),
    Escape: () => setPlaying(false),
    o: () => {
      const post = orderedPosts[currentSlideIndex];
      if (post) {
        window.open(post.canonicalUrl, "_blank", "noreferrer");
      }
    },
    O: () => {
      const post = orderedPosts[currentSlideIndex];
      if (post) {
        window.open(post.canonicalUrl, "_blank", "noreferrer");
      }
    },
  });

  const currentPost = orderedPosts[currentSlideIndex];

  if (isLoading) {
    return <div className="loading-state">Loading slideshow...</div>;
  }

  return (
    <div className="page-stack slideshow-page">
      <section className="page-header page-header-row">
        <div>
          <div className="eyebrow">keyboard ready</div>
          <h1>Slideshow</h1>
        </div>
        <Link className="button button-secondary" to="/library">
          Back to library
        </Link>
      </section>

      <SlideshowControls
        post={currentPost}
        index={currentSlideIndex}
        total={orderedPosts.length}
        isPlaying={isPlaying}
        isShuffle={isShuffle}
        intervalMs={intervalMs}
        onPrevious={() => previousSlide(orderedPosts.length)}
        onNext={() => nextSlide(orderedPosts.length)}
        onTogglePlaying={togglePlaying}
        onToggleShuffle={toggleShuffle}
        onIntervalChange={setIntervalMs}
      />

      <SlideshowViewer post={currentPost} />

      {orderedPosts.length === 0 ? (
        <div className="button-row">
          <Button variant="primary" onClick={() => setPlaying(false)}>
            Stop autoplay
          </Button>
          <Link className="button button-secondary" to="/import">
            Import posts
          </Link>
        </div>
      ) : null}
    </div>
  );
}
