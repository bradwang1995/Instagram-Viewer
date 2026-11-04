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
  expect(screen.getAllByText("0%")).toHaveLength(2);
  expect(screen.getAllByText("100%")).toHaveLength(2);
  fireEvent.change(sliders[0], { target: { value: "50" } });
  expect(sliders[1]).toHaveValue("50");
  expect(usePersonFocus.getState().strength).toBe(50);
  fireEvent.change(sliders[1], { target: { value: "0" } });
  expect(sliders[0]).toHaveAttribute("aria-valuetext", "Original");
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
  expect(screen.getByRole("status")).toHaveTextContent("Preparing focus");
  act(() => usePersonFocus.setState({ pending: 0 }));
  expect(
    screen.getByRole("slider", { name: "Focus on person" }),
  ).toBeInTheDocument();
});
