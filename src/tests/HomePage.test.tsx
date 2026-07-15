import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedPost } from "../db/schema";
import { HomePage } from "../pages/HomePage";

const testState = vi.hoisted(() => ({
  posts: [] as SavedPost[],
  refresh: vi.fn(),
  downloadBackup: vi.fn(),
  restoreBackup: vi.fn(),
}));

vi.mock("../hooks/usePosts", () => ({
  usePosts: () => ({
    posts: testState.posts,
    isLoading: false,
    error: undefined,
    refresh: testState.refresh,
  }),
}));

vi.mock("../db/postRepository", () => ({ clearLocalDatabase: vi.fn() }));
vi.mock("../features/import/importJson", () => ({
  importSavedPostsJsonFile: vi.fn(),
}));
vi.mock("../features/backup/exportBackup", () => ({
  downloadAppBackup: testState.downloadBackup,
}));
vi.mock("../features/backup/importBackup", () => ({
  importAppBackupFile: testState.restoreBackup,
}));
vi.mock("../features/slideshow/shuffle", () => ({
  shuffleArray: <T,>(items: T[]) => [...items].reverse(),
}));

describe("HomePage viewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.posts = Array.from({ length: 25 }, (_, index) =>
      createPost(index + 1),
    );
    testState.downloadBackup.mockResolvedValue(undefined);
    testState.restoreBackup.mockResolvedValue({
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      posts: testState.posts,
      collections: [],
      importJobs: [],
    });
  });

  it("loads 20 library rows, selects a clicked post, and advances", () => {
    const { container } = render(<HomePage />);

    expect(container.querySelectorAll(".gallery-list-item")).toHaveLength(20);
    expect(screen.getByTitle("Photo CODE25")).toHaveAttribute(
      "src",
      "https://www.instagram.com/p/CODE25/embed/",
    );

    fireEvent.click(screen.getByRole("button", { name: /CODE24/i }));
    expect(screen.getByTitle("Photo CODE24")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next post" }));
    expect(screen.getByTitle("Photo CODE23")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Shuffle playback" }));
    fireEvent.click(screen.getByRole("button", { name: "Next post" }));
    expect(screen.getByTitle("Photo CODE24")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load 20 more" }));
    expect(container.querySelectorAll(".gallery-list-item")).toHaveLength(25);
  });

  it("downloads and restores a portable local backup", async () => {
    const { container } = render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "Download backup" }));
    await waitFor(() => expect(testState.downloadBackup).toHaveBeenCalledOnce());

    const backupInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Restore backup file"]',
    );
    expect(backupInput).not.toBeNull();

    const file = new File(["{}"], "viewer-backup.json", {
      type: "application/json",
    });
    fireEvent.change(backupInput!, { target: { files: [file] } });

    await waitFor(() => expect(testState.restoreBackup).toHaveBeenCalledWith(file));
    expect(testState.refresh).toHaveBeenCalled();
    expect(screen.getByText("Restored 25 saved photos.")).toBeInTheDocument();
  });
});

function createPost(index: number): SavedPost {
  const shortcode = `CODE${index}`;
  const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;
  const savedAt = `2026-01-${String(index).padStart(2, "0")}T12:00:00.000Z`;

  return {
    id: `post:${shortcode}`,
    url: canonicalUrl,
    canonicalUrl,
    shortcode,
    savedAt,
    importedAt: savedAt,
    updatedAt: savedAt,
    collectionNames: [],
    sourceFilePaths: ["test.json"],
    sourceFormat: "json",
    localTags: [],
    status: "unknown",
  };
}
