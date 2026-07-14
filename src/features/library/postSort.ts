import type { SavedPost } from "../../db/schema";

export type PostSort =
  | "newest_saved"
  | "oldest_saved"
  | "recently_imported"
  | "recently_updated"
  | "random";

export function sortPosts(posts: SavedPost[], sort: PostSort): SavedPost[] {
  const sorted = [...posts];

  if (sort === "random") {
    return sorted.sort(() => Math.random() - 0.5);
  }

  return sorted.sort((a, b) => {
    if (sort === "oldest_saved") {
      return dateValue(a.savedAt ?? a.importedAt) - dateValue(b.savedAt ?? b.importedAt);
    }

    if (sort === "recently_imported") {
      return dateValue(b.importedAt) - dateValue(a.importedAt);
    }

    if (sort === "recently_updated") {
      return dateValue(b.updatedAt) - dateValue(a.updatedAt);
    }

    return dateValue(b.savedAt ?? b.importedAt) - dateValue(a.savedAt ?? a.importedAt);
  });
}

function dateValue(value?: string): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
