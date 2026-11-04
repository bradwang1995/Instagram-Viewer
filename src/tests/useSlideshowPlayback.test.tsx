import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSlideshowPlayback } from "../hooks/useSlideshowPlayback";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("waits for decoding, gives each photo its full dwell, and uses the latest navigation callback", () => {
  vi.useFakeTimers();
  const next = vi.fn();
  const latest = vi.fn();
  const view = renderHook(
    ({ id, ready, advance }) =>
      useSlideshowPlayback(true, id, ready, 3000, advance),
    {
      initialProps: { id: "first", ready: false, advance: next },
    },
  );
  act(() => vi.advanceTimersByTime(10000));
  expect(next).not.toHaveBeenCalled();
  view.rerender({ id: "first", ready: true, advance: next });
  act(() => vi.advanceTimersByTime(2999));
  view.rerender({ id: "first", ready: true, advance: latest });
  act(() => vi.advanceTimersByTime(1));
  expect(next).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledTimes(1);
  view.rerender({ id: "second", ready: false, advance: latest });
  act(() => vi.advanceTimersByTime(10000));
  expect(latest).toHaveBeenCalledTimes(1);
});

it("pauses in the background or under a photo panel and resumes with a full dwell", () => {
  vi.useFakeTimers();
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const next = vi.fn();
  const view = renderHook(
    ({ enabled }) => useSlideshowPlayback(enabled, "current", true, 3000, next),
    { initialProps: { enabled: true } },
  );
  act(() => vi.advanceTimersByTime(2000));
  visibility.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => vi.advanceTimersByTime(10000));
  expect(next).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => vi.advanceTimersByTime(2999));
  expect(next).not.toHaveBeenCalled();
  view.rerender({ enabled: false });
  act(() => vi.advanceTimersByTime(10000));
  expect(next).not.toHaveBeenCalled();
  view.rerender({ enabled: true });
  act(() => vi.advanceTimersByTime(3000));
  expect(next).toHaveBeenCalledTimes(1);
});

it("resets the remaining dwell when manually navigating to an already loaded photo", () => {
  vi.useFakeTimers();
  const next = vi.fn();
  const view = renderHook(
    ({ id }) => useSlideshowPlayback(true, id, true, 5000, next),
    { initialProps: { id: "first" } },
  );
  act(() => vi.advanceTimersByTime(4500));
  view.rerender({ id: "second" });
  act(() => vi.advanceTimersByTime(4999));
  expect(next).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(next).toHaveBeenCalledTimes(1);
});
