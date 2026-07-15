import { LinkIcon, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { bulkUpsertImportedPosts } from "../../db/postRepository";
import type { SavedPost } from "../../db/schema";
import { createSavedPostFromUrl } from "../../features/import/importTypes";
import { mergeSavedPost } from "../../features/import/mergeSavedPost";
import { extractInstagramUrls } from "../../features/import/parseInstagramUrl";
import { Button } from "../common/Button";

export function ManualUrlImport() {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const candidateCount = useMemo(() => extractInstagramUrls(text).length, [text]);

  async function submit() {
    const postsById = new Map<string, SavedPost>();

    for (const rawUrl of extractInstagramUrls(text)) {
      const post = createSavedPostFromUrl(rawUrl, {
        sourceFilePath: "manual-input",
        sourceFormat: "manual",
      });

      if (!post) {
        continue;
      }

      const existing = postsById.get(post.id);
      postsById.set(post.id, existing ? mergeSavedPost(existing, post) : post);
    }

    const result = await bulkUpsertImportedPosts(Array.from(postsById.values()));
    setMessage(
      `${result.newCount} new, ${result.updatedCount} updated from ${postsById.size} unique URLs.`,
    );
    setText("");
  }

  return (
    <section className="import-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">manual</div>
          <h2>Paste Instagram photo URLs</h2>
        </div>
        <LinkIcon size={20} aria-hidden="true" />
      </div>
      <textarea
        className="textarea"
        value={text}
        rows={7}
        onChange={(event) => setText(event.target.value)}
        placeholder="https://www.instagram.com/p/ABC123/"
      />
      <div className="button-row">
        <span className="muted">{candidateCount} candidate URLs</span>
        <Button
          variant="primary"
          onClick={submit}
          disabled={candidateCount === 0}
        >
          <Plus size={16} aria-hidden="true" />
          Add URLs
        </Button>
      </div>
      {message ? <p className="success-text">{message}</p> : null}
    </section>
  );
}
