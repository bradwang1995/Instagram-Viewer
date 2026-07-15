import { ExternalLink, Heart, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SavedPost } from "../../db/schema";
import { updatePost } from "../../db/postRepository";
import { formatDateTime } from "../../utils/date";
import { Button } from "../common/Button";
import { InstagramBlockquoteEmbed } from "./InstagramBlockquoteEmbed";
import { PostFallbackCard } from "./PostFallbackCard";

type PostDetailDrawerProps = {
  post: SavedPost | undefined;
  onClose: () => void;
};

export function PostDetailDrawer({ post, onClose }: PostDetailDrawerProps) {
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setNote(post?.localNote ?? "");
    setTags(post?.localTags.join(", ") ?? "");
    setSavedMessage("");
  }, [post]);

  if (!post) {
    return null;
  }

  async function save() {
    if (!post) {
      return;
    }

    await updatePost(post.id, {
      localNote: note.trim(),
      localTags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    setSavedMessage("Saved");
  }

  async function toggleFavorite() {
    if (!post) {
      return;
    }

    await updatePost(post.id, { favorite: !post.favorite });
  }

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Post details"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <div className="eyebrow">photo</div>
            <h2>{post.shortcode}</h2>
          </div>
          <Button
            className="icon-button"
            variant="ghost"
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </header>

        <div className="drawer-content">
          <InstagramBlockquoteEmbed post={post} />
          <PostFallbackCard post={post} />

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
            <div>
              <dt>Source</dt>
              <dd>{post.sourceFilePaths.join(", ")}</dd>
            </div>
          </dl>

          <label className="field">
            <span>Tags</span>
            <input
              className="input"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="interior, recipe, reference"
            />
          </label>

          <label className="field">
            <span>Note</span>
            <textarea
              className="textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              placeholder="Add a private local note"
            />
          </label>
        </div>

        <footer className="drawer-footer">
          <a
            className="button button-secondary"
            href={post.canonicalUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={16} aria-hidden="true" />
            Open
          </a>
          <Button variant="secondary" onClick={toggleFavorite}>
            <Heart size={16} aria-hidden="true" />
            {post.favorite ? "Favorited" : "Favorite"}
          </Button>
          <Button variant="primary" onClick={save}>
            <Save size={16} aria-hidden="true" />
            Save
          </Button>
          {savedMessage ? <span className="save-message">{savedMessage}</span> : null}
        </footer>
      </aside>
    </div>
  );
}
