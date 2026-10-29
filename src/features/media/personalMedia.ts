import type { MediaQueueItem } from "./mediaQueue";

export const LOCAL_SERVICE = "http://127.0.0.1:5178";
export const LOCAL_SERVICE_KEY = "instagram-viewer:local-service";
const TOKEN_KEY = "instagram-viewer:local-session";
export function localServiceEnabled(): boolean {
  return localStorage.getItem(LOCAL_SERVICE_KEY) === "enabled";
}
export function personalUrl(path: string): string {
  if (import.meta.env.MODE === "personal") return path;
  const url = new URL(path, LOCAL_SERVICE);
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) url.searchParams.set("session", token);
  return url.href;
}
export async function connectLocalService(timeoutMs = 5000): Promise<boolean> {
  const options: RequestInit & { targetAddressSpace: "loopback" } = {
    method: "POST",
    headers: { "X-Viewer-Connect": "1" },
    credentials: "omit",
    signal: AbortSignal.timeout(timeoutMs),
    targetAddressSpace: "loopback",
  };
  const response = await fetch(`${LOCAL_SERVICE}/api/personal/connect`, {
    ...options,
  });
  if (!response.ok) throw new Error("Local service unavailable.");
  const data = await response.json();
  if (typeof data.session !== "string" || !/^[a-f0-9]{64}$/.test(data.session))
    throw new Error("Please update the local service.");
  const changed = sessionStorage.getItem(TOKEN_KEY) !== data.session;
  sessionStorage.setItem(TOKEN_KEY, data.session);
  return changed;
}
export function setLocalService(enabled: boolean): void {
  if (enabled) localStorage.setItem(LOCAL_SERVICE_KEY, "enabled");
  else {
    localStorage.removeItem(LOCAL_SERVICE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export function usesPersonalMedia(item: MediaQueueItem): boolean {
  return (
    (import.meta.env.MODE === "personal" || localServiceEnabled()) &&
    Boolean(item.post.shortcode) &&
    item.media.sourceKind !== "demo" &&
    item.media.sourceKind !== "local"
  );
}

export function mediaSource(item: MediaQueueItem): string | undefined {
  if (usesPersonalMedia(item)) {
    return personalUrl(
      `/api/personal/images/${encodeURIComponent(item.post.shortcode!)}/${item.media.sourceIndex}`,
    );
  }
  return item.media.assetUrl ?? item.media.previewUrl;
}
