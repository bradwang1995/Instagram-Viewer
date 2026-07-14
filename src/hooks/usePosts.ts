import { useCallback, useEffect, useState } from "react";
import { getAllPosts } from "../db/postRepository";
import type { SavedPost } from "../db/schema";
import { createDemoPosts } from "../dev/demoPosts";

export function usePosts() {
  const isDemo =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("demo") === "1";
  const [posts, setPosts] = useState<SavedPost[]>(() =>
    isDemo ? createDemoPosts() : [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      setError(undefined);

      if (isDemo) {
        setPosts(createDemoPosts());
        return;
      }

      const nextPosts = await getAllPosts();
      setPosts(nextPosts);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not load posts.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    void refresh();

    window.addEventListener("instagram-saved-viewer:db-changed", refresh);

    return () => {
      window.removeEventListener("instagram-saved-viewer:db-changed", refresh);
    };
  }, [refresh]);

  return { posts, isLoading, error, refresh };
}
