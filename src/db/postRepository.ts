import { mergeSavedPost } from "../features/import/mergeSavedPost";
import { createFallbackMediaItem, db, notifyDbChanged } from "./db";
import type { Collection, MediaItem, SavedPost } from "./schema";

export type UpsertResult = {
  posts: SavedPost[];
  newCount: number;
  updatedCount: number;
};

export async function getAllPosts(): Promise<SavedPost[]> {
  return db.posts.toArray();
}

export async function getVisiblePosts(): Promise<SavedPost[]> {
  const posts = await getAllPosts();
  return posts.filter((post) => !post.hidden);
}

export async function getPost(id: string): Promise<SavedPost | undefined> {
  return db.posts.get(id);
}

export async function bulkUpsertImportedPosts(
  incomingPosts: SavedPost[],
  resolvedMediaItems: MediaItem[] = [],
): Promise<UpsertResult> {
  if (incomingPosts.length === 0) {
    if (resolvedMediaItems.length > 0) {
      throw new Error("Resolved media cannot be imported without its source posts.");
    }
    return { posts: [], newCount: 0, updatedCount: 0 };
  }

  const existingPosts = await db.posts.bulkGet(
    incomingPosts.map((post) => post.id),
  );
  let newCount = 0;
  let updatedCount = 0;

  const mergedPosts = incomingPosts.map((incomingPost, index) => {
    const existingPost = existingPosts[index];

    if (existingPost) {
      updatedCount += 1;
      return mergeSavedPost(existingPost, incomingPost);
    }

    newCount += 1;
    return incomingPost;
  });
  validateResolvedMediaItems(mergedPosts, resolvedMediaItems);

  await db.transaction(
    "rw",
    db.posts,
    db.collections,
    db.mediaItems,
    async () => {
      await db.posts.bulkPut(mergedPosts);
      await upsertCollectionsForPosts(mergedPosts);
      await ensureMediaItemsForPosts(mergedPosts, resolvedMediaItems);
    },
  );

  notifyDbChanged();
  return { posts: mergedPosts, newCount, updatedCount };
}

export async function updatePost(
  id: string,
  patch: Partial<
    Pick<
      SavedPost,
      "localNote" | "localTags" | "favorite" | "hidden" | "status"
    >
  >,
): Promise<SavedPost | undefined> {
  const existing = await db.posts.get(id);

  if (!existing) {
    return undefined;
  }

  const updated: SavedPost = {
    ...existing,
    ...patch,
    localTags: patch.localTags ?? existing.localTags,
    updatedAt: new Date().toISOString(),
  };

  await db.posts.put(updated);
  notifyDbChanged();
  return updated;
}

export async function clearLocalDatabase(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.posts,
      db.collections,
      db.importJobs,
      db.settings,
      db.mediaItems,
      db.mediaPreferences,
    ],
    async () => {
      await Promise.all([
        db.posts.clear(),
        db.collections.clear(),
        db.importJobs.clear(),
        db.settings.clear(),
        db.mediaItems.clear(),
        db.mediaPreferences.clear(),
      ]);
    },
  );
  notifyDbChanged();
}

async function ensureMediaItemsForPosts(
  posts: SavedPost[],
  resolvedMediaItems: MediaItem[],
): Promise<void> {
  if (posts.length === 0) return;

  const existingItems = await db.mediaItems
    .where("sourcePostId")
    .anyOf(posts.map((post) => post.id))
    .toArray();
  const populatedPostIds = new Set(
    existingItems.map((media) => media.sourcePostId),
  );
  const resolvedPostIds = new Set(
    resolvedMediaItems.map((media) => media.sourcePostId),
  );
  const incomingMediaIds = new Set(
    resolvedMediaItems.map((media) => media.id),
  );
  const existingById = new Map(existingItems.map((media) => [media.id, media]));
  const resolvedItemsToPut = resolvedMediaItems.map((media) => ({
    ...media,
    createdAt: existingById.get(media.id)?.createdAt ?? media.createdAt,
  }));
  const staleMediaIds = existingItems
    .filter(
      (media) =>
        resolvedPostIds.has(media.sourcePostId) &&
        !incomingMediaIds.has(media.id),
    )
    .map((media) => media.id);
  const missingItems = posts
    .filter(
      (post) =>
        !resolvedPostIds.has(post.id) && !populatedPostIds.has(post.id),
    )
    .map((post) => createFallbackMediaItem(post));

  if (staleMediaIds.length > 0) {
    await db.mediaItems.bulkDelete(staleMediaIds);
  }
  if (resolvedItemsToPut.length > 0) {
    await db.mediaItems.bulkPut(resolvedItemsToPut);
  }
  if (missingItems.length > 0) {
    await db.mediaItems.bulkPut(missingItems);
  }
}

function validateResolvedMediaItems(
  posts: SavedPost[],
  mediaItems: MediaItem[],
): void {
  const postIds = new Set(posts.map((post) => post.id));
  const mediaIds = new Set<string>();

  for (const media of mediaItems) {
    if (!postIds.has(media.sourcePostId)) {
      throw new Error(`Resolved media references unknown post ${media.sourcePostId}.`);
    }
    if (mediaIds.has(media.id)) {
      throw new Error(`Resolved media id ${media.id} is duplicated.`);
    }
    mediaIds.add(media.id);
  }
}

async function upsertCollectionsForPosts(posts: SavedPost[]): Promise<void> {
  const now = new Date().toISOString();
  const byCollection = new Map<string, string[]>();

  for (const post of posts) {
    for (const name of post.collectionNames) {
      const normalizedName = name.trim();

      if (!normalizedName) {
        continue;
      }

      const id = createCollectionId(normalizedName);
      const current = byCollection.get(id) ?? [];
      current.push(post.id);
      byCollection.set(id, current);
    }
  }

  for (const [id, postIds] of byCollection) {
    const existing = await db.collections.get(id);
    const name = id.replace(/^instagram_export:/, "");
    const uniquePostIds = Array.from(
      new Set([...(existing?.postIds ?? []), ...postIds]),
    );
    const collection: Collection = {
      id,
      name,
      source: "instagram_export",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      postIds: uniquePostIds,
    };

    await db.collections.put(collection);
  }
}

function createCollectionId(name: string): string {
  return `instagram_export:${name.toLowerCase()}`;
}
