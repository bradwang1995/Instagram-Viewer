import { db } from "../../db/db";
import { bulkUpsertImportedPosts } from "../../db/postRepository";
import type { ImportJob, ImportWarning, SavedPost } from "../../db/schema";
import { extractPostsFromJson } from "./extractPostsFromJson";
import { extractResolvedMediaManifest } from "./extractResolvedMediaManifest";
import { mergeSavedPost } from "./mergeSavedPost";

const MAX_JSON_IMPORT_BYTES = 120 * 1024 * 1024;

export async function importSavedPostsJsonFile(file: File): Promise<ImportJob> {
  const startedAt = new Date().toISOString();
  const job: ImportJob = {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSizeBytes: file.size,
    startedAt,
    status: "parsing",
    totalFilesScanned: 1,
    totalJsonFilesScanned: 1,
    totalHtmlFilesScanned: 0,
    totalUrlsFound: 0,
    totalUniquePostsFound: 0,
    totalNewPostsAdded: 0,
    totalExistingPostsUpdated: 0,
    warnings: [],
  };

  await db.importJobs.put(job);

  try {
    if (!file.name.toLowerCase().endsWith(".json")) {
      job.warnings.push({
        code: "JSON_PARSE_FAILED",
        message: "The selected file is not a JSON file.",
      });
      throw new Error("Please choose your Instagram saved photos JSON file.");
    }
    if (file.size > MAX_JSON_IMPORT_BYTES) {
      throw new Error("JSON files larger than 120 MiB are not supported.");
    }

    const text = await file.text();
    const json = JSON.parse(text) as unknown;
    const context = {
      sourceFilePath: file.name,
      sourceFormat: "json" as const,
      candidateCollectionName: "saved photos",
    };
    const manifest = extractResolvedMediaManifest(json, context);
    const extractedPosts = manifest.matched
      ? manifest.posts
      : extractPostsFromJson(json, context);
    const postsById = dedupePosts(extractedPosts);
    const uniquePosts = Array.from(postsById.values());

    job.totalUrlsFound = extractedPosts.length;
    job.totalUniquePostsFound = uniquePosts.length;

    if (uniquePosts.length === 0) {
      job.warnings.push({
        code: "NO_SAVED_POSTS_FOUND",
        message: "No Instagram photo-post URLs were found in this JSON file.",
      });
    }

    const result = await bulkUpsertImportedPosts(
      uniquePosts,
      manifest.mediaItems,
    );
    job.totalNewPostsAdded = result.newCount;
    job.totalExistingPostsUpdated = result.updatedCount;
    job.status = "completed";
    job.finishedAt = new Date().toISOString();
    await db.importJobs.put(job);
    return job;
  } catch (error) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error =
      error instanceof Error ? error.message : "Could not import this JSON file.";
    await db.importJobs.put(job);
    return job;
  }
}

function dedupePosts(posts: SavedPost[]): Map<string, SavedPost> {
  const postsById = new Map<string, SavedPost>();

  for (const post of posts) {
    const existing = postsById.get(post.id);
    postsById.set(post.id, existing ? mergeSavedPost(existing, post) : post);
  }

  return postsById;
}
