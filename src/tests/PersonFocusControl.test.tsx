import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ArchiveControlBar } from "../components/archive/ArchiveChrome";
import { usePersonFocus } from "../features/media/personFocus";
afterEach(() => usePersonFocus.setState({ strength: 0 }));
it("shares a labeled 0–100 focus slider across footers", () => {
  render(
    <>
      <ArchiveControlBar />
      <ArchiveControlBar />
    </>,
  );
  const sliders = screen.getAllByRole("slider", { name: "Focus on person" });
  expect(sliders[0]).toHaveValue("0");
  expect(screen.getAllByText("0%")).toHaveLength(2);
  expect(screen.getAllByText("100%")).toHaveLength(2);
  fireEvent.change(sliders[0], { target: { value: "50" } });
  expect(sliders[1]).toHaveValue("50");
  expect(usePersonFocus.getState().strength).toBe(50);
  fireEvent.change(sliders[1], { target: { value: "0" } });
  expect(sliders[0]).toHaveAttribute("aria-valuetext", "Original");
});
