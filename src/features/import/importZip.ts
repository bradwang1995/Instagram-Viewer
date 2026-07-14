import JSZip from "jszip";
import { db } from "../../db/db";
import { bulkUpsertImportedPosts } from "../../db/postRepository";
import type { ImportJob, ImportWarning, SavedPost } from "../../db/schema";
import { extractPostsFromHtml } from "./extractPostsFromHtml";
import { extractPostsFromJson } from "./extractPostsFromJson";
import { mergeSavedPost } from "./mergeSavedPost";

export async function importInstagramZip(file: File): Promise<ImportJob> {
  const startedAt = new Date().toISOString();
  const job: ImportJob = {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSizeBytes: file.size,
    startedAt,
    status: "parsing",
    totalFilesScanned: 0,
    totalJsonFilesScanned: 0,
    totalHtmlFilesScanned: 0,
    totalUrlsFound: 0,
    totalUniquePostsFound: 0,
    totalNewPostsAdded: 0,
    totalExistingPostsUpdated: 0,
    warnings: [],
  };

  await db.importJobs.put(job);

  try {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      job.warnings.push({
        code: "ZIP_FILE_SKIPPED",
        message: "The selected file is not a ZIP archive.",
      });
      throw new Error("This does not look like an Instagram export ZIP.");
    }

    const zip = await JSZip.loadAsync(file);
    const postsById = new Map<string, SavedPost>();
    const candidateFiles = Object.values(zip.files).filter((entry) => !entry.dir);
    job.totalFilesScanned = candidateFiles.length;

    for (const entry of candidateFiles) {
      const sourceFilePath = entry.name;
      const lowerPath = sourceFilePath.toLowerCase();

      if (lowerPath.endsWith(".json")) {
        job.totalJsonFilesScanned += 1;
        await readJsonEntry(entry, sourceFilePath, postsById, job.warnings);
      } else if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) {
        job.totalHtmlFilesScanned += 1;
        await readHtmlEntry(entry, sourceFilePath, postsById, job.warnings);
      }
    }

    const importedPosts = Array.from(postsById.values());
    job.totalUrlsFound = importedPosts.reduce(
      (total, post) => total + Math.max(1, post.sourceFilePaths.length),
      0,
    );
    job.totalUniquePostsFound = importedPosts.length;

    if (importedPosts.length === 0) {
      job.warnings.push({
        code: "NO_SAVED_POSTS_FOUND",
        message:
          "No Instagram post, Reel, or TV URLs were found. Try exporting more account data or use manual URL import.",
      });
    }

    const result = await bulkUpsertImportedPosts(importedPosts);
    job.totalNewPostsAdded = result.newCount;
    job.totalExistingPostsUpdated = result.updatedCount;
    job.status = "completed";
    job.finishedAt = new Date().toISOString();
    await db.importJobs.put(job);
    return job;
  } catch (error) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = error instanceof Error ? error.message : "Import failed.";
    await db.importJobs.put(job);
    return job;
  }
}

async function readJsonEntry(
  entry: JSZip.JSZipObject,
  sourceFilePath: string,
  postsById: Map<string, SavedPost>,
  warnings: ImportWarning[],
) {
  try {
    const text = await entry.async("text");
    const json = JSON.parse(text) as unknown;
    const posts = extractPostsFromJson(json, {
      sourceFilePath,
      sourceFormat: "json",
    });
    mergeIntoMap(postsById, posts);
  } catch (error) {
    warnings.push({
      code: "JSON_PARSE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Could not parse this JSON file.",
      sourceFilePath,
    });
  }
}

async function readHtmlEntry(
  entry: JSZip.JSZipObject,
  sourceFilePath: string,
  postsById: Map<string, SavedPost>,
  warnings: ImportWarning[],
) {
  try {
    const html = await entry.async("text");
    const posts = extractPostsFromHtml(html, {
      sourceFilePath,
      sourceFormat: "html",
    });
    mergeIntoMap(postsById, posts);
  } catch (error) {
    warnings.push({
      code: "HTML_PARSE_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Could not parse this HTML file.",
      sourceFilePath,
    });
  }
}

function mergeIntoMap(postsById: Map<string, SavedPost>, posts: SavedPost[]) {
  for (const post of posts) {
    const existing = postsById.get(post.id);
    postsById.set(post.id, existing ? mergeSavedPost(existing, post) : post);
  }
}
