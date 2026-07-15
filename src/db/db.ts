import Dexie, { Table } from "dexie";
import type {
  AppSettings,
  Collection,
  ImportJob,
  SavedPost,
} from "./schema";

const VERSION_1_STORES = {
  posts:
    "id, shortcode, type, status, savedAt, importedAt, updatedAt, favorite, hidden, *localTags, *collectionNames",
  collections: "id, name, source, createdAt, updatedAt",
  importJobs: "id, fileName, startedAt, status",
  settings: "id",
};

const PHOTO_ONLY_STORES = {
  ...VERSION_1_STORES,
  posts:
    "id, shortcode, status, savedAt, importedAt, updatedAt, favorite, hidden, *localTags, *collectionNames",
};

export class AppDatabase extends Dexie {
  posts!: Table<SavedPost, string>;
  collections!: Table<Collection, string>;
  importJobs!: Table<ImportJob, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("InstagramSavedViewerDB");

    this.version(1).stores(VERSION_1_STORES);

    this.version(2).stores(PHOTO_ONLY_STORES).upgrade(async (transaction) => {
      const posts = transaction.table("posts");
      const collections = transaction.table("collections");
      const storedPosts = (await posts.toArray()) as Array<
        SavedPost & { type?: string }
      >;
      const removedPostIds = new Set(
        storedPosts
          .filter(
            (post) =>
              post.type !== "post" || !isInstagramPhotoPostUrl(post.canonicalUrl),
          )
          .map((post) => post.id),
      );

      if (removedPostIds.size > 0) {
        await posts.bulkDelete(Array.from(removedPostIds));
      }

      await posts.toCollection().modify((post: SavedPost & { type?: string }) => {
        delete post.type;
      });

      const emptyCollectionIds: string[] = [];
      await collections
        .toCollection()
        .modify((collection: Collection) => {
          collection.postIds = collection.postIds.filter(
            (postId) => !removedPostIds.has(postId),
          );

          if (collection.postIds.length === 0) {
            emptyCollectionIds.push(collection.id);
          }
        });

      if (emptyCollectionIds.length > 0) {
        await collections.bulkDelete(emptyCollectionIds);
      }
    });
  }
}

export const db = new AppDatabase();

export function notifyDbChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("instagram-saved-viewer:db-changed"));
  }
}

function isInstagramPhotoPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const [pathSegment, shortcode] = url.pathname.split("/").filter(Boolean);
    return (
      ["instagram.com", "www.instagram.com"].includes(url.hostname) &&
      pathSegment === "p" &&
      Boolean(shortcode)
    );
  } catch {
    return false;
  }
}
