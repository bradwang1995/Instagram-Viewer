import { ExternalLink, LoaderCircle, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { SavedPost } from "../../db/schema";
import { getInstagramEmbedUrl } from "../../features/embed/instagramEmbedUrl";
import { Button } from "../common/Button";

export function InstagramBlockquoteEmbed({ post }: { post: SavedPost }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const embedUrl = getInstagramEmbedUrl(post);

  useEffect(() => {
    setReloadKey(0);
    setIsLoading(true);
  }, [post.canonicalUrl]);

  return (
    <div className="embed-frame" data-testid="instagram-viewer">
      {isLoading ? (
        <div className="embed-loading" role="status">
          <LoaderCircle size={22} className="spin" aria-hidden="true" />
          <span>Loading preview...</span>
        </div>
      ) : null}
      <iframe
        key={`${post.id}:${reloadKey}`}
        className="instagram-embed-iframe"
        src={embedUrl}
        title={`${post.type === "reel" ? "Reel" : "Photo"} ${post.shortcode ?? post.id}`}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setIsLoading(false)}
      />
      <div className="embed-actions">
        <Button
          className="icon-button"
          variant="secondary"
          aria-label="Reload preview"
          title="Reload preview"
          onClick={() => {
            setIsLoading(true);
            setReloadKey((value) => value + 1);
          }}
        >
          <RotateCw size={17} aria-hidden="true" />
        </Button>
        <a
          className="button button-secondary"
          href={post.canonicalUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={16} aria-hidden="true" />
          Instagram
        </a>
      </div>
    </div>
  );
}
