import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ArchiveControlBar } from "../components/archive/ArchiveChrome";
import { usePersonFocus } from "../features/media/personFocus";
afterEach(() => usePersonFocus.setState({ strength: 0, pending: 0 }));
it("shares a labeled 0–200 focus slider across footers", () => {
  render(
    <>
      <ArchiveControlBar />
      <ArchiveControlBar />
    </>,
  );
  const sliders = screen.getAllByRole("slider", { name: "Focus on person" });
  expect(sliders[0]).toHaveValue("0");
  expect(sliders[0]).toHaveAttribute("max", "200");
  expect(screen.getAllByText("200%")).toHaveLength(2);
  fireEvent.change(sliders[0], { target: { value: "50" } });
  expect(sliders[1]).toHaveValue("50");
  expect(usePersonFocus.getState().strength).toBe(50);
  fireEvent.change(sliders[1], { target: { value: "0" } });
  expect(sliders[0]).toHaveAttribute("aria-valuetext", "Original");
});

it("snaps a released pointer near 100 without trapping keyboard adjustments", () => {
  render(<ArchiveControlBar />);
  const slider = screen.getByRole("slider", { name: "Focus on person" });
  fireEvent.change(slider, { target: { value: "102" } });
  fireEvent.pointerUp(slider);
  expect(slider).toHaveValue("100");
  fireEvent.change(slider, { target: { value: "101" } });
  expect(slider).toHaveValue("101");
});

it("toggles browser-local display options", () => {
  render(<ArchiveControlBar />);
  for (const name of ["Sharpen", "Auto rotate 90°", "People only"]) {
    const button = screen.getByRole("button", { name });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  }
});

it("shows date labels and values without dashes", () => {
  const { container } = render(
    <ArchiveControlBar
      dateRange={{
        months: [new Date(2026, 6, 15).getTime()],
        startIndex: 0,
        endIndex: 0,
        onStartChange: () => {},
        onEndChange: () => {},
      }}
    />,
  );
  const labels = container.querySelectorAll(".archive-date-value");
  expect(labels[0]).toHaveTextContent("Start timeJul 2026");
  expect(labels[1]).toHaveTextContent("Jul 2026End time");
  expect(container.querySelector(".person-focus-slider")).not.toHaveTextContent(
    "-",
  );
});

it("replaces the focus slider with a loading indicator until preparation finishes", () => {
  usePersonFocus.setState({ pending: 1 });
  render(<ArchiveControlBar />);
  expect(screen.queryByRole("slider", { name: "Focus on person" })).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Preparing");
  act(() => usePersonFocus.setState({ pending: 0 }));
  expect(
    screen.getByRole("slider", { name: "Focus on person" }),
  ).toBeInTheDocument();
});
