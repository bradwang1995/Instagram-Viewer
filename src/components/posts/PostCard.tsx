import { EyeOff, ExternalLink, Heart, PenSquare } from "lucide-react";
import type { SavedPost } from "../../db/schema";
import { updatePost } from "../../db/postRepository";
import { formatDateTime } from "../../utils/date";
import { Button } from "../common/Button";

type PostCardProps = {
  post: SavedPost;
  onOpenDetails: (post: SavedPost) => void;
};

export function PostCard({ post, onOpenDetails }: PostCardProps) {
  async function toggleFavorite() {
    await updatePost(post.id, { favorite: !post.favorite });
  }

  async function toggleHidden() {
    await updatePost(post.id, { hidden: !post.hidden });
  }

  return (
    <article className={post.hidden ? "post-card post-card-hidden" : "post-card"}>
      <div className="post-card-preview">
        <span className="post-type">{post.type}</span>
        <span className="shortcode">{post.shortcode}</span>
      </div>
      <div className="post-card-body">
        <div className="post-meta-row">
          <span>{post.status}</span>
          <span>{formatDateTime(post.savedAt ?? post.importedAt)}</span>
        </div>
        {post.collectionNames.length > 0 ? (
          <div className="chip-row">
            {post.collectionNames.slice(0, 3).map((collection) => (
              <span className="chip" key={collection}>
                {collection}
              </span>
            ))}
          </div>
        ) : null}
        {post.localTags.length > 0 ? (
          <div className="chip-row">
            {post.localTags.slice(0, 4).map((tag) => (
              <span className="chip chip-accent" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="post-actions">
          <a
            className="icon-button"
            href={post.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in Instagram"
            title="Open in Instagram"
          >
            <ExternalLink size={17} aria-hidden="true" />
          </a>
          <Button
            className="icon-button"
            variant="ghost"
            onClick={() => onOpenDetails(post)}
            aria-label="Edit post"
            title="Edit post"
          >
            <PenSquare size={17} aria-hidden="true" />
          </Button>
          <Button
            className={post.favorite ? "icon-button active" : "icon-button"}
            variant="ghost"
            onClick={toggleFavorite}
            aria-label="Toggle favorite"
            title="Toggle favorite"
          >
            <Heart size={17} aria-hidden="true" />
          </Button>
          <Button
            className={post.hidden ? "icon-button active" : "icon-button"}
            variant="ghost"
            onClick={toggleHidden}
            aria-label="Hide post"
            title="Hide post"
          >
            <EyeOff size={17} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  );
}
