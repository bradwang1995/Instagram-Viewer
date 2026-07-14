import Dexie, { Table } from "dexie";
import type {
  AppSettings,
  Collection,
  ImportJob,
  SavedPost,
} from "./schema";

export class AppDatabase extends Dexie {
  posts!: Table<SavedPost, string>;
  collections!: Table<Collection, string>;
  importJobs!: Table<ImportJob, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("InstagramSavedViewerDB");

    this.version(1).stores({
      posts:
        "id, shortcode, type, status, savedAt, importedAt, updatedAt, favorite, hidden, *localTags, *collectionNames",
      collections: "id, name, source, createdAt, updatedAt",
      importJobs: "id, fileName, startedAt, status",
      settings: "id",
    });
  }
}

export const db = new AppDatabase();

export function notifyDbChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("instagram-saved-viewer:db-changed"));
  }
}
