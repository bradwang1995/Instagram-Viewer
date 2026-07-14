import type { SavedPost } from "../../db/schema";
import { formatDateTime } from "../../utils/date";
import { InstagramBlockquoteEmbed } from "../posts/InstagramBlockquoteEmbed";
import { PostFallbackCard } from "../posts/PostFallbackCard";

export function SlideshowViewer({ post }: { post: SavedPost | undefined }) {
  if (!post) {
    return (
      <section className="slideshow-empty">
        <h2>No posts available</h2>
        <p>Import posts or loosen the current library filters.</p>
      </section>
    );
  }

  return (
    <section className="slideshow-viewer">
      <div className="slideshow-stage">
        <InstagramBlockquoteEmbed post={post} />
        <PostFallbackCard post={post} />
      </div>
      <aside className="slideshow-meta">
        <div className="eyebrow">{post.type}</div>
        <h2>{post.shortcode}</h2>
        <dl className="detail-list">
          <div>
            <dt>Status</dt>
            <dd>{post.status}</dd>
          </div>
          <div>
            <dt>Saved</dt>
            <dd>{formatDateTime(post.savedAt)}</dd>
          </div>
          <div>
            <dt>Imported</dt>
            <dd>{formatDateTime(post.importedAt)}</dd>
          </div>
        </dl>
        {post.localTags.length > 0 ? (
          <div className="chip-row">
            {post.localTags.map((tag) => (
              <span className="chip chip-accent" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {post.localNote ? <p className="note-box">{post.localNote}</p> : null}
      </aside>
    </section>
  );
}
