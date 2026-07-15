import type { AppBackup, SavedPost } from "../../db/schema";
import { parseInstagramUrl } from "../import/parseInstagramUrl";

export function sanitizePhotoOnlyBackup(backup: AppBackup): AppBackup {
  const posts = backup.posts.flatMap((post) => {
    if (!parseInstagramUrl(post.canonicalUrl).isValid) {
      return [];
    }

    const photoPost = { ...post } as SavedPost & { type?: unknown };
    delete photoPost.type;
    return [photoPost as SavedPost];
  });
  const retainedPostIds = new Set(posts.map((post) => post.id));
  const collections = (backup.collections ?? [])
    .map((collection) => ({
      ...collection,
      postIds: collection.postIds.filter((postId) => retainedPostIds.has(postId)),
    }))
    .filter((collection) => collection.postIds.length > 0);

  return {
    ...backup,
    posts,
    collections,
  };
}
