import { ExternalLink } from "lucide-react";
import type { SavedPost } from "../../db/schema";

export function PostFallbackCard({ post }: { post: SavedPost }) {
  return (
    <div className="post-fallback">
      <div className="eyebrow">Preview unavailable</div>
      <p>
        This post may be private, deleted, blocked, or unavailable for embedding.
      </p>
      <code>{post.canonicalUrl}</code>
      <a
        className="button button-secondary"
        href={post.canonicalUrl}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={16} aria-hidden="true" />
        Open in Instagram
      </a>
    </div>
  );
}
