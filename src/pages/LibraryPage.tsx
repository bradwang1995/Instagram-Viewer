import { Link, useNavigate } from "react-router-dom";
import { Play, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { SavedPost, SavedPostStatus } from "../db/schema";
import { EmptyState } from "../components/common/EmptyState";
import { Input } from "../components/common/Input";
import { Button } from "../components/common/Button";
import { PostCard } from "../components/posts/PostCard";
import { PostDetailDrawer } from "../components/posts/PostDetailDrawer";
import { EMPTY_FILTERS, filterPosts } from "../features/library/postFilters";
import type { PostSort } from "../features/library/postSort";
import { sortPosts } from "../features/library/postSort";
import { usePosts } from "../hooks/usePosts";

const STATUS_OPTIONS: Array<SavedPostStatus | "all"> = [
  "all",
  "unknown",
  "embeddable",
  "embed_failed",
  "private_or_unavailable",
  "deleted_or_removed",
  "invalid_url",
];

const SORT_OPTIONS: Array<{ label: string; value: PostSort }> = [
  { label: "Newest saved", value: "newest_saved" },
  { label: "Oldest saved", value: "oldest_saved" },
  { label: "Recently imported", value: "recently_imported" },
  { label: "Recently updated", value: "recently_updated" },
  { label: "Random", value: "random" },
];

export function LibraryPage() {
  const navigate = useNavigate();
  const { posts, isLoading, error } = usePosts();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SavedPostStatus | "all">("all");
  const [collection, setCollection] = useState("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<PostSort>("newest_saved");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SavedPost | undefined>();

  const collectionOptions = useMemo(
    () =>
      Array.from(new Set(posts.flatMap((post) => post.collectionNames))).sort(),
    [posts],
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(posts.flatMap((post) => post.localTags))).sort(),
    [posts],
  );

  const visiblePosts = useMemo(() => {
    const filters = {
      ...EMPTY_FILTERS,
      searchQuery: query,
      statuses: status === "all" ? [] : [status],
      collections: collection === "all" ? [] : [collection],
      tags: tag === "all" ? [] : [tag],
      includeHidden,
      favoritesOnly,
    };

    return sortPosts(filterPosts(posts, filters), sort);
  }, [
    collection,
    favoritesOnly,
    includeHidden,
    posts,
    query,
    sort,
    status,
    tag,
  ]);

  function startSlideshow() {
    sessionStorage.setItem(
      "instagram-saved-viewer:slideshow-post-ids",
      JSON.stringify(visiblePosts.map((post) => post.id)),
    );
    navigate("/slideshow");
  }

  if (isLoading) {
    return <div className="loading-state">Loading library...</div>;
  }

  if (error) {
    return <div className="error-text">{error}</div>;
  }

  if (posts.length === 0) {
    return (
      <EmptyState
        title="No saved photos imported yet."
        action={
          <Link className="button button-primary" to="/import">
            Import
          </Link>
        }
      >
        Export your Instagram information from Accounts Center, then import the ZIP
        here.
      </EmptyState>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-header page-header-row">
        <div>
          <div className="eyebrow">{posts.length.toLocaleString()} total records</div>
          <h1>Library</h1>
        </div>
        <Button
          variant="primary"
          onClick={startSlideshow}
          disabled={visiblePosts.length === 0}
        >
          <Play size={16} aria-hidden="true" />
          Start slideshow
        </Button>
      </section>

      <section className="toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search URL, shortcode, note, tag, collection"
          />
        </label>
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as SavedPostStatus | "all")
          }
        >
          {STATUS_OPTIONS.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          value={collection}
          onChange={(event) => setCollection(event.target.value)}
        >
          <option value="all">all collections</option>
          {collectionOptions.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
        <select value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="all">all tags</option>
          {tagOptions.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as PostSort)}>
          {SORT_OPTIONS.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="check-control">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(event) => setFavoritesOnly(event.target.checked)}
          />
          Favorites
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(event) => setIncludeHidden(event.target.checked)}
          />
          Hidden
        </label>
      </section>

      <div className="result-count">{visiblePosts.length.toLocaleString()} shown</div>

      {visiblePosts.length === 0 ? (
        <EmptyState title="No posts match the current filters." />
      ) : (
        <section className="post-grid" aria-label="Saved photos">
          {visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenDetails={setSelectedPost}
            />
          ))}
        </section>
      )}

      <PostDetailDrawer
        post={selectedPost}
        onClose={() => setSelectedPost(undefined)}
      />
    </div>
  );
}
