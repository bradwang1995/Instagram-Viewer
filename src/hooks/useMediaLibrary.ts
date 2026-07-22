import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAllMediaItems,
  getAllMediaPreferences,
} from "../db/mediaRepository";
import type { MediaItem, MediaPreference } from "../db/schema";
import { createDemoMediaItems } from "../dev/demoPosts";
import { buildMediaQueue } from "../features/media/mediaQueue";
import { isDemoMode, usePosts } from "./usePosts";

export function useMediaLibrary() {
  const postsState = usePosts();
  const demo = isDemoMode();
  const postsRef = useRef(postsState.posts);
  postsRef.current = postsState.posts;
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(() =>
    demo ? createDemoMediaItems(postsState.posts) : [],
  );
  const [preferences, setPreferences] = useState<MediaPreference[]>([]);
  const [mediaError, setMediaError] = useState<string>();
  const [isMediaLoading, setIsMediaLoading] = useState(true);
  const refreshGeneration = useRef(0);

  const refreshMedia = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      setMediaError(undefined);

      if (demo) {
        const storedPreferences = await getAllMediaPreferences();
        if (generation !== refreshGeneration.current) return;
        setMediaItems(createDemoMediaItems(postsRef.current));
        setPreferences(storedPreferences);
        return;
      }

      const [storedItems, storedPreferences] = await Promise.all([
        getAllMediaItems(),
        getAllMediaPreferences(),
      ]);
      if (generation !== refreshGeneration.current) return;
      setMediaItems(storedItems);
      setPreferences(storedPreferences);
    } catch (error) {
      if (generation !== refreshGeneration.current) return;
      setMediaError(
        error instanceof Error ? error.message : "Could not load media.",
      );
    } finally {
      if (generation === refreshGeneration.current) {
        setIsMediaLoading(false);
      }
    }
  }, [demo]);

  useEffect(() => {
    void refreshMedia();
    window.addEventListener("instagram-viewer:db-changed", refreshMedia);
    return () => {
      refreshGeneration.current += 1;
      window.removeEventListener("instagram-viewer:db-changed", refreshMedia);
    };
  }, [refreshMedia]);

  const queue = useMemo(
    () => buildMediaQueue(postsState.posts, mediaItems, preferences),
    [mediaItems, postsState.posts, preferences],
  );

  return {
    ...postsState,
    isLoading: postsState.isLoading || isMediaLoading,
    queue,
    preferences,
    isDemo: demo,
    error: postsState.error ?? mediaError,
    refresh: postsState.refresh,
  };
}
