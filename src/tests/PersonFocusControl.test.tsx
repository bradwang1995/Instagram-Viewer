import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ArchiveControlBar } from "../components/archive/ArchiveChrome";
import { usePersonFocus } from "../features/media/personFocus";
afterEach(() => usePersonFocus.setState({ strength: 0, pending: 0 }));
it("shares a labeled 0–100 focus slider across footers", () => {
  render(
    <>
      <ArchiveControlBar />
      <ArchiveControlBar />
    </>,
  );
  const sliders = screen.getAllByRole("slider", { name: "Focus on person" });
  expect(sliders[0]).toHaveValue("0");
  expect(sliders[0]).toHaveAttribute("max", "100");
  expect(screen.getAllByText("100%")).toHaveLength(2);
  fireEvent.change(sliders[0], { target: { value: "50" } });
  expect(sliders[1]).toHaveValue("50");
  expect(usePersonFocus.getState().strength).toBe(50);
  fireEvent.change(sliders[1], { target: { value: "0" } });
  expect(sliders[0]).toHaveAttribute("aria-valuetext", "Original");
});

it("does not snap pointer releases to a different strength", () => {
  render(<ArchiveControlBar />);
  const slider = screen.getByRole("slider", { name: "Focus on person" });
  fireEvent.change(slider, { target: { value: "97" } });
  fireEvent.pointerUp(slider);
  expect(slider).toHaveValue("97");
});

it("toggles browser-local display options", () => {
  render(<ArchiveControlBar />);
  fireEvent.click(screen.getByText("View Options"));
  expect(screen.queryByText("Super Resolution")).toBeNull();
  for (const name of ["Auto Rotate", "Human Only"]) {
    const button = screen.getByRole("switch", { name });
    expect(button.title).not.toBe("");
    expect(button.closest("label")).toHaveAttribute("title", button.title);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-checked", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-checked", "false");
  }
});
it("closes View Options with Escape without dismissing its containing photo dialog", () => {
  render(<ArchiveControlBar />);
  const summary = screen.getByText("View Options");
  fireEvent.click(summary);
  expect(summary.closest("details")).toHaveAttribute("open");
  expect(
    fireEvent.keyDown(screen.getByRole("switch", { name: "Auto Rotate" }), {
      key: "Escape",
    }),
  ).toBe(false);
  expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(summary).toHaveFocus();
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
