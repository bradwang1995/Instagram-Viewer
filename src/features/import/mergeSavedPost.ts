import type { SavedPost } from "../../db/schema";

export function mergeSavedPost(
  existing: SavedPost,
  incoming: SavedPost,
): SavedPost {
  const now = new Date().toISOString();

  return {
    ...existing,
    url: incoming.url || existing.url,
    canonicalUrl: incoming.canonicalUrl || existing.canonicalUrl,
    shortcode: incoming.shortcode ?? existing.shortcode,
    savedAt: existing.savedAt ?? incoming.savedAt,
    importedAt: existing.importedAt,
    updatedAt: now,
    collectionNames: unique([...existing.collectionNames, ...incoming.collectionNames]),
    sourceFilePaths: unique([
      ...existing.sourceFilePaths,
      ...incoming.sourceFilePaths,
    ]),
    sourceFormat: existing.sourceFormat,
    title: existing.title ?? incoming.title,
    description: existing.description ?? incoming.description,
    localNote: existing.localNote,
    localTags: existing.localTags,
    favorite: existing.favorite,
    hidden: existing.hidden,
    embedHtml: existing.embedHtml ?? incoming.embedHtml,
    embedAuthorName: existing.embedAuthorName ?? incoming.embedAuthorName,
    embedProviderName: existing.embedProviderName ?? incoming.embedProviderName,
    embedThumbnailUrl: existing.embedThumbnailUrl ?? incoming.embedThumbnailUrl,
    embedFetchedAt: existing.embedFetchedAt ?? incoming.embedFetchedAt,
    embedLastError: existing.embedLastError ?? incoming.embedLastError,
    status: existing.status !== "unknown" ? existing.status : incoming.status,
  };
}

function unique(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}
