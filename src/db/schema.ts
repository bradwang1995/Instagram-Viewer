export type SavedPostType = "post" | "reel" | "tv" | "unknown";

export type SavedPostStatus =
  | "unknown"
  | "embeddable"
  | "embed_failed"
  | "private_or_unavailable"
  | "deleted_or_removed"
  | "invalid_url";

export type SavedPostSourceFormat =
  | "json"
  | "html"
  | "manual"
  | "app_backup";

export type SavedPost = {
  id: string;
  url: string;
  canonicalUrl: string;
  shortcode?: string;
  type: SavedPostType;
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
  | "pending"
  | "parsing"
  | "completed"
  | "failed"
  | "cancelled";

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
  createdAt: string;
  updatedAt: string;
};

export type AppBackup = {
  version: 1;
  exportedAt: string;
  posts: SavedPost[];
  collections: Collection[];
  settings?: AppSettings;
  importJobs: ImportJob[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  id: "app_settings",
  slideshowIntervalMs: 5000,
  slideshowShuffle: false,
  slideshowShowControls: true,
  slideshowShowMetadata: true,
  defaultView: "grid",
  preferredEmbedMode: "blockquote",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};
