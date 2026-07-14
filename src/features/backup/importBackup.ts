import { z } from "zod";
import { db, notifyDbChanged } from "../../db/db";
import type { AppBackup } from "../../db/schema";

const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  posts: z.array(z.record(z.unknown())),
  collections: z.array(z.record(z.unknown())).optional().default([]),
  settings: z.record(z.unknown()).optional(),
  importJobs: z.array(z.record(z.unknown())).optional().default([]),
});

export async function importAppBackupFile(file: File): Promise<AppBackup> {
  const text = await file.text();
  const parsed = backupSchema.parse(JSON.parse(text));
  const backup = parsed as AppBackup;

  await db.transaction(
    "rw",
    db.posts,
    db.collections,
    db.importJobs,
    db.settings,
    async () => {
      await db.posts.bulkPut(backup.posts);
      await db.collections.bulkPut(backup.collections ?? []);
      await db.importJobs.bulkPut(backup.importJobs ?? []);

      if (backup.settings) {
        await db.settings.put(backup.settings);
      }
    },
  );

  notifyDbChanged();
  return backup;
}
