import type { SavedPost, SavedPostStatus } from "../../db/schema";

export type PostFilters = {
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  statuses: SavedPostStatus[];
  collections: string[];
  tags: string[];
  includeHidden: boolean;
  favoritesOnly: boolean;
};

export const EMPTY_FILTERS: PostFilters = {
  searchQuery: "",
  dateFrom: "",
  dateTo: "",
  statuses: [],
  collections: [],
  tags: [],
  includeHidden: false,
  favoritesOnly: false,
};

export function filterPosts(posts: SavedPost[], filters: PostFilters): SavedPost[] {
  const query = filters.searchQuery.trim().toLowerCase();
  const dateFrom = startOfLocalDay(filters.dateFrom);
  const dateTo = endOfLocalDay(filters.dateTo);

  return posts.filter((post) => {
    if (post.hidden && !filters.includeHidden) {
      return false;
    }

    if (filters.favoritesOnly && !post.favorite) {
      return false;
    }

    if (query) {
      const haystack = [
        post.url,
        post.canonicalUrl,
        post.shortcode,
        post.localNote,
        ...post.localTags,
        ...post.collectionNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    if (dateFrom !== undefined || dateTo !== undefined) {
      const postDate = dateValue(post.savedAt ?? post.importedAt);

      if (
        postDate === undefined ||
        (dateFrom !== undefined && postDate < dateFrom) ||
        (dateTo !== undefined && postDate > dateTo)
      ) {
        return false;
      }
    }

    if (filters.statuses.length > 0 && !filters.statuses.includes(post.status)) {
      return false;
    }

    if (
      filters.collections.length > 0 &&
      !post.collectionNames.some((name) => filters.collections.includes(name))
    ) {
      return false;
    }

    if (
      filters.tags.length > 0 &&
      !post.localTags.some((tag) => filters.tags.includes(tag))
    ) {
      return false;
    }

    return true;
  });
}

function startOfLocalDay(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function endOfLocalDay(value: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function dateValue(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}
