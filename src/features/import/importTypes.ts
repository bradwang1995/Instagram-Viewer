import type { SavedPost, SavedPostSourceFormat } from "../../db/schema";
import { createPostId, parseInstagramUrl } from "./parseInstagramUrl";

export type ExtractContext = {
  sourceFilePath: string;
  sourceFormat: SavedPostSourceFormat;
  candidateCollectionName?: string;
};

export type CreateSavedPostOptions = {
  savedAt?: string;
  collectionNames?: string[];
  importedAt?: string;
};

export function createSavedPostFromUrl(
  rawUrl: string,
  context: ExtractContext,
  options: CreateSavedPostOptions = {},
): SavedPost | undefined {
  const parsed = parseInstagramUrl(rawUrl);

  if (
    !parsed.isValid ||
    !parsed.canonicalUrl ||
    !parsed.shortcode
  ) {
    return undefined;
  }

  const now = options.importedAt ?? new Date().toISOString();
  const collectionNames = uniqueCompact([
    context.candidateCollectionName,
    ...(options.collectionNames ?? []),
  ]);

  return {
    id: createPostId(parsed.shortcode),
    url: rawUrl,
    canonicalUrl: parsed.canonicalUrl,
    shortcode: parsed.shortcode,
    savedAt: options.savedAt,
    importedAt: now,
    updatedAt: now,
    collectionNames,
    sourceFilePaths: [context.sourceFilePath],
    sourceFormat: context.sourceFormat,
    localTags: [],
    favorite: false,
    hidden: false,
    status: "unknown",
  };
}

function uniqueCompact(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}
