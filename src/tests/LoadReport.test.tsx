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
