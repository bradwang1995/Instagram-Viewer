export type SavedPostStatus =
  | "unknown"
  | "embeddable"
  | "embed_failed"
  | "private_or_unavailable"
  | "deleted_or_removed"
  | "invalid_url";

export type SavedPostSourceFormat = "json" | "html" | "manual";

export type MediaSourceKind = "local" | "remote" | "embed" | "demo";

export type MediaItem = {
  id: string;
  sourcePostId: string;
  sourceMediaId?: string;
  sourceIndex: number;
  type: "image" | "video";
  sourceKind: MediaSourceKind;
  creatorHandle?: string;
  caption?: string;
  previewUrl?: string;
  assetUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
};

export type MediaPreference = {
  mediaId: string;
  visibility: "visible" | "hidden";
  rating: -1 | 0 | 1;
  hiddenAt?: string;
  localTags: string[];
  updatedAt: string;
};

export type TransitionPreset =
  | "crossfade"
  | "directional-wipe"
  | "depth-zoom"
  | "film-burn"
  | "rgb-split"
  | "ken-burns";

export type SavedPost = {
  id: string;
  externalId?: string;
  url: string;
  canonicalUrl: string;
  shortcode?: string;
  savedAt?: string;
  importedAt: string;
  updatedAt: string;
  collectionNames: string[];
  sourceFilePaths: string[];
  sourceFormat: SavedPostSourceFormat;
  title?: string;
  description?: string;
  localNote?: string;
  localTags: string[];
  favorite?: boolean;
  hidden?: boolean;
  embedHtml?: string;
  embedAuthorName?: string;
  embedProviderName?: string;
  embedThumbnailUrl?: string;
  embedFetchedAt?: string;
  embedLastError?: string;
  status: SavedPostStatus;
};

export type ImportJobStatus =
  "pending" | "parsing" | "completed" | "failed" | "cancelled";

export type ImportWarningCode =
  | "ZIP_FILE_SKIPPED"
  | "JSON_PARSE_FAILED"
  | "HTML_PARSE_FAILED"
  | "NO_SAVED_POSTS_FOUND"
  | "UNKNOWN_EXPORT_STRUCTURE"
  | "DUPLICATE_URL"
  | "INVALID_INSTAGRAM_URL";

export type ImportWarning = {
  code: ImportWarningCode;
  message: string;
  sourceFilePath?: string;
};

export type ImportJob = {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  startedAt: string;
  finishedAt?: string;
  status: ImportJobStatus;
  totalFilesScanned: number;
  totalJsonFilesScanned: number;
  totalHtmlFilesScanned: number;
  totalUrlsFound: number;
  totalUniquePostsFound: number;
  totalNewPostsAdded: number;
  totalExistingPostsUpdated: number;
  warnings: ImportWarning[];
  error?: string;
};

export type Collection = {
  id: string;
  name: string;
  source: "instagram_export" | "local";
  createdAt: string;
  updatedAt: string;
  postIds: string[];
};

export type AppSettings = {
  id: "app_settings";
  slideshowIntervalMs: number;
  slideshowShuffle: boolean;
  slideshowShowControls: boolean;
  slideshowShowMetadata: boolean;
  defaultView: "grid" | "slideshow";
  preferredEmbedMode: "blockquote" | "oembed" | "link_only";
  slideshowTransitionDurationMs: number;
  slideshowTransitionPreset: TransitionPreset;
  slideshowLoopMode: "off" | "session" | "source-post";
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app_settings",
  slideshowIntervalMs: 5000,
  slideshowShuffle: false,
  slideshowShowControls: true,
  slideshowShowMetadata: true,
  defaultView: "grid",
  preferredEmbedMode: "blockquote",
  slideshowTransitionDurationMs: 700,
  slideshowTransitionPreset: "crossfade",
  slideshowLoopMode: "session",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};
