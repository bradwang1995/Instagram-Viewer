import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoadReport } from "../components/archive/LoadReport";
import * as report from "../features/media/loadReport";

afterEach(() => vi.restoreAllMocks());

it("does no background report reads while closed and refreshes when opened or updated", () => {
  const read = vi.spyOn(report, "readLoadReport").mockReturnValue([]);
  const view = render(<LoadReport />);
  const dialog = view.container.querySelector("dialog")!;
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
  };
  read.mockClear();
  act(() => window.dispatchEvent(new Event("viewer:load-report-updated")));
  expect(read).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new Event("viewer:show-load-report")));
  expect(read).toHaveBeenCalledTimes(1);
  act(() => window.dispatchEvent(new Event("viewer:load-report-updated")));
  expect(read).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  act(() => window.dispatchEvent(new Event("viewer:load-report-updated")));
  expect(read).toHaveBeenCalledTimes(2);
  act(() => window.dispatchEvent(new Event("viewer:show-load-report")));
  expect(read).toHaveBeenCalledTimes(3);
});

it("exports versioned diagnostics, history and separate post / photo summaries", async () => {
  const row = {
    shortcode: "Example",
    sourceIndex: 0,
    source: "local" as const,
    outcome: "loaded" as const,
    code: "loaded",
    stage: "image",
    time: "2026-11-03T23:00:00Z",
    observations: 2,
    firstFailure: {
      code: "graphql_error",
      stage: "metadata",
      time: "2026-11-03T22:59:00Z",
    },
    history: [
      {
        outcome: "loaded" as const,
        code: "loaded",
        stage: "image",
        time: "2026-11-03T23:00:00Z",
      },
    ],
    diagnostics: { imageCache: "hit" as const, upstreamRequests: 0 },
  };
  vi.spyOn(report, "readLoadReport").mockReturnValue([
    row,
    { ...row, sourceIndex: 1, firstFailure: undefined },
  ]);
  let blob!: Blob;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn((value: Blob) => {
        blob = value;
        return "blob:report-test";
      }),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const view = render(<LoadReport />);
  const dialog = view.container.querySelector("dialog")!;
  dialog.showModal = () => {
    dialog.open = true;
  };
  act(() => window.dispatchEvent(new Event("viewer:show-load-report")));
  fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  const data = JSON.parse(text);
  expect(data).toMatchObject({
    schemaVersion: 3,
    app: { revision: expect.any(String) },
    summary: {
      photos: { loaded: 2 },
      posts: { loaded: 1 },
      recoveredPhotos: 1,
    },
  });
  expect(data.rows[0]).toMatchObject({
    observations: 2,
    firstFailure: { code: "graphql_error" },
    diagnostics: { imageCache: "hit", upstreamRequests: 0 },
  });
  vi.unstubAllGlobals();
});
