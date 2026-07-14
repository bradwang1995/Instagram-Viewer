import { db, notifyDbChanged } from "./db";
import { AppSettings, DEFAULT_SETTINGS } from "./schema";

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get("app_settings");

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const settings = {
    ...DEFAULT_SETTINGS,
    createdAt: now,
    updatedAt: now,
  };

  await db.settings.put(settings);
  notifyDbChanged();
  return settings;
}

export async function updateSettings(
  patch: Partial<Omit<AppSettings, "id" | "createdAt">>,
): Promise<AppSettings> {
  const existing = await getSettings();
  const updated: AppSettings = {
    ...existing,
    ...patch,
    id: "app_settings",
    updatedAt: new Date().toISOString(),
  };

  await db.settings.put(updated);
  notifyDbChanged();
  return updated;
}
