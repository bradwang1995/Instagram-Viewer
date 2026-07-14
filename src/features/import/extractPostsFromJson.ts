import type { SavedPost } from "../../db/schema";
import type { ExtractContext } from "./importTypes";
import { createSavedPostFromUrl } from "./importTypes";
import { extractInstagramUrls } from "./parseInstagramUrl";

const TIMESTAMP_KEYS = [
  "timestamp",
  "creation_timestamp",
  "created_timestamp",
  "saved_timestamp",
  "media_creation_timestamp",
  "date",
  "created_at",
  "saved_at",
];

const COLLECTION_KEYS = [
  "collection_name",
  "collection",
  "folder",
  "title",
  "name",
  "label",
];

export function extractPostsFromJson(
  json: unknown,
  context: ExtractContext,
): SavedPost[] {
  const results: SavedPost[] = [];

  function walk(
    node: unknown,
    parent: unknown,
    collectionStack: string[] = [],
    ancestors: unknown[] = [],
  ) {
    if (typeof node === "string") {
      const rawUrls = extractInstagramUrls(node);
      const savedAt = inferTimestampFromNearbyObjects([parent, ...ancestors]);

      for (const rawUrl of rawUrls) {
        const post = createSavedPostFromUrl(rawUrl, context, {
          savedAt,
          collectionNames: collectionStack,
        });

        if (post) {
          results.push(post);
        }
      }
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child, node, collectionStack, [node, ...ancestors]);
      }
      return;
    }

    if (node && typeof node === "object") {
      const collectionName = inferCollectionNameFromObject(node);
      const nextStack = collectionName
        ? [...collectionStack, collectionName]
        : collectionStack;

      for (const child of Object.values(node)) {
        walk(child, node, nextStack, [node, ...ancestors]);
      }
    }
  }

  walk(json, undefined, inferCollectionNamesFromPath(context.sourceFilePath));
  return results;
}

export function inferTimestampFromNearbyObject(parent: unknown): string | undefined {
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
    return undefined;
  }

  for (const key of TIMESTAMP_KEYS) {
    const value = (parent as Record<string, unknown>)[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      const milliseconds = value > 10_000_000_000 ? value : value * 1000;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }

    if (typeof value === "string") {
      const date = new Date(value);

      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  for (const value of Object.values(parent)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    for (const key of TIMESTAMP_KEYS) {
      const nestedValue = (value as Record<string, unknown>)[key];

      if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
        const milliseconds =
          nestedValue > 10_000_000_000 ? nestedValue : nestedValue * 1000;
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
      }

      if (typeof nestedValue === "string") {
        const date = new Date(nestedValue);

        if (!Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
    }
  }

  return undefined;
}

function inferTimestampFromNearbyObjects(
  parents: unknown[],
): string | undefined {
  for (const parent of parents) {
    const timestamp = inferTimestampFromNearbyObject(parent);

    if (timestamp) {
      return timestamp;
    }
  }

  return undefined;
}

export function inferCollectionNameFromObject(node: unknown): string | undefined {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return undefined;
  }

  const objectNode = node as Record<string, unknown>;

  for (const key of COLLECTION_KEYS) {
    const value = objectNode[key];

    if (typeof value === "string" && isUsefulCollectionName(value)) {
      return value.trim();
    }
  }

  const stringMapData = objectNode.string_map_data;
  if (
    stringMapData &&
    typeof stringMapData === "object" &&
    !Array.isArray(stringMapData)
  ) {
    for (const value of Object.values(stringMapData)) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).value === "string" &&
        isUsefulCollectionName((value as Record<string, string>).value)
      ) {
        return (value as Record<string, string>).value.trim();
      }
    }
  }

  return undefined;
}

function inferCollectionNamesFromPath(sourceFilePath: string): string[] {
  const pathParts = sourceFilePath
    .split(/[\\/]/)
    .map((part) => part.replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "))
    .filter(isUsefulCollectionName);

  return pathParts
    .filter((part) => /saved|collection|folder/i.test(part))
    .map((part) => part.trim());
}

function isUsefulCollectionName(value: string): boolean {
  const cleaned = value.trim();

  if (cleaned.length < 2 || cleaned.length > 80) {
    return false;
  }

  if (/^https?:\/\//i.test(cleaned)) {
    return false;
  }

  return true;
}
