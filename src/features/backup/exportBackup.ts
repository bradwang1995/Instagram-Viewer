import { db } from "../../db/db";
import type { AppBackup } from "../../db/schema";

export async function createAppBackup(): Promise<AppBackup> {
  const [posts, collections, settings, importJobs] = await Promise.all([
    db.posts.toArray(),
    db.collections.toArray(),
    db.settings.get("app_settings"),
    db.importJobs.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    posts,
    collections,
    settings,
    importJobs,
  };
}

export async function downloadAppBackup(): Promise<void> {
  const backup = await createAppBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  anchor.href = url;
  anchor.download = `instagram-saved-viewer-backup-${timestamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
