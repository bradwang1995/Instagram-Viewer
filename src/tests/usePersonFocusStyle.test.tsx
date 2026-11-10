import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePersonFocusStyle } from "../hooks/usePersonFocusStyle";
import { usePersonFocus } from "../features/media/personFocus";
import { detectPerson } from "../features/media/personDetector";
vi.mock("../features/media/personDetector", () => ({ detectPerson: vi.fn() }));
beforeEach(() => {
  usePersonFocus.setState({
    strength: 100,
    pending: 0,
    peopleOnly: false,
    detectionError: false,
  });
  vi.mocked(detectPerson).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  usePersonFocus.setState({ strength: 100 });
  vi.clearAllMocks();
});
it("prepares loaded photos at zero while leaving the original framing", async () => {
  usePersonFocus.setState({ strength: 0 });
  const ref = { current: new Image() };
  const { result } = renderHook(() => usePersonFocusStyle(ref, "photo", true));
  await act(async () => {});
  expect(result.current.style).toEqual({ transition: "none" });
  expect(detectPerson).toHaveBeenCalledTimes(1);
  expect(usePersonFocus.getState().pending).toBe(0);
});
it("keeps preparation active at zero and cancels when the photo is no longer ready", async () => {
  let complete!: (
    boxes: {
      originX: number;
      originY: number;
      width: number;
      height: number;
    }[],
  ) => void;
  vi.mocked(detectPerson).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const image = new Image();
  const ref = { current: image };
  const { result, rerender } = renderHook(
    ({ ready }) => usePersonFocusStyle(ref, "photo", ready),
    { initialProps: { ready: true } },
  );
  expect(usePersonFocus.getState().pending).toBe(1);
  expect(result.current.style?.transition).toBe("none");
  const signal = vi.mocked(detectPerson).mock.calls[0][3];
  act(() => usePersonFocus.setState({ strength: 0 }));
  expect(signal.aborted).toBe(false);
  rerender({ ready: false });
  expect(signal.aborted).toBe(true);
  expect(usePersonFocus.getState().pending).toBe(0);
  await act(async () =>
    complete([{ originX: 100, originY: 200, width: 200, height: 500 }]),
  );
  expect(result.current.style).toEqual({ transition: "none" });
});
it("animates a delayed detected crop from the original framing and cancels on unmount", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(detectPerson).mockResolvedValue([
    { originX: 200, originY: 300, width: 200, height: 500 },
  ]);
  const image = new Image();
  Object.defineProperties(image, {
    naturalWidth: { value: 900 },
    naturalHeight: { value: 1160 },
    clientWidth: { value: 450 },
    clientHeight: { value: 580 },
  });
  const cancel = vi.fn();
  const animate = vi.fn().mockReturnValue({ cancel, playState: "running" });
  image.animate = animate;
  const ref = { current: image };
  const { result, unmount } = renderHook(() =>
    usePersonFocusStyle(ref, "photo", true),
  );
  const openingFraming = result.current.getFraming();
  expect(openingFraming).toBeInstanceOf(Promise);
  await waitFor(() =>
    expect(result.current.style?.transform).toContain("scale("),
  );
  await expect(openingFraming).resolves.toEqual({
    crop: { x: 200, y: 300, width: 200, height: 500 },
    rotation: 0,
    strength: 100,
  });
  expect(result.current.style?.transition).toBe("none");
  const signal = vi.mocked(detectPerson).mock.calls[0][3];
  expect(animate).toHaveBeenCalledWith(
    [
      { transform: "translate(-50%, -50%) translate(0px, 0px) scale(1)" },
      { transform: result.current.style.transform },
    ],
    expect.objectContaining({ duration: 600 }),
  );
  unmount();
  expect(cancel).toHaveBeenCalled();
  expect(signal.aborted).toBe(true);
});

it("never zooms out an already-large cover image", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    objectFit: "cover",
  } as CSSStyleDeclaration);
  vi.mocked(detectPerson).mockResolvedValue([
    { originX: 0, originY: 100, width: 900, height: 1000 },
  ]);
  const image = new Image();
  Object.defineProperties(image, {
    naturalWidth: { value: 900 },
    naturalHeight: { value: 1200 },
    clientWidth: { value: 600 },
    clientHeight: { value: 600 },
  });
  const ref = { current: image };
  const { result } = renderHook(() => usePersonFocusStyle(ref, "large", true));
  await act(async () => {});
  expect(result.current.style?.transform).toContain("scale(1)");
  expect(result.current.style?.transition).toBe("none");
  expect(result.current.style).not.toHaveProperty("objectFit");
  vi.restoreAllMocks();
});

it("updates slider strength without restarting detection", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(detectPerson).mockResolvedValue([
    { originX: 200, originY: 300, width: 200, height: 500 },
  ]);
  const image = new Image();
  Object.defineProperties(image, {
    naturalWidth: { value: 900 },
    naturalHeight: { value: 1200 },
    clientWidth: { value: 450 },
    clientHeight: { value: 600 },
  });
  const ref = { current: image };
  const { result } = renderHook(() => usePersonFocusStyle(ref, "photo", true));
  await waitFor(() =>
    expect(result.current.style?.transform).toContain("scale("),
  );
  const full = result.current.style?.transform;
  act(() => usePersonFocus.setState({ strength: 50 }));
  expect(result.current.style?.transform).not.toEqual(full);
  expect(detectPerson).toHaveBeenCalledTimes(1);
  act(() => usePersonFocus.setState({ strength: 0 }));
  expect(result.current.style.transform).toBe(
    "translate(-50%, -50%) translate(0px, 0px) scale(1)",
  );
  expect(result.current.style.position).toBe("absolute");
});

it("holds focus readiness while a photo is still loading and releases it on unmount", () => {
  const ref = { current: new Image() };
  const view = renderHook(() =>
    usePersonFocusStyle(ref, undefined, false, true),
  );
  expect(usePersonFocus.getState().pending).toBe(1);
  expect(detectPerson).not.toHaveBeenCalled();
  view.unmount();
  expect(usePersonFocus.getState().pending).toBe(0);
});
it("retries transient detection failures when Human Only is enabled", async () => {
  usePersonFocus.setState({ peopleOnly: true });
  vi.mocked(detectPerson).mockResolvedValueOnce(null).mockResolvedValueOnce([]);
  const image = new Image();
  renderHook(() =>
    usePersonFocusStyle(
      { current: image },
      "retry-photo",
      true,
      true,
      "retry-photo",
    ),
  );
  await waitFor(() =>
    expect(usePersonFocus.getState().people["retry-photo"]).toBe(false),
  );
  expect(detectPerson).toHaveBeenCalledTimes(2);
  expect(usePersonFocus.getState().pending).toBe(0);
});
it("reports failed classification rather than silently claiming the filter completed", async () => {
  usePersonFocus.setState({ peopleOnly: true });
  vi.mocked(detectPerson).mockResolvedValue(null);
  const ref = { current: new Image() };
  renderHook(() =>
    usePersonFocusStyle(
      ref,
      "unavailable-photo",
      true,
      true,
      "unavailable-photo",
    ),
  );
  await waitFor(() =>
    expect(usePersonFocus.getState().detectionError).toBe(true),
  );
  expect(usePersonFocus.getState().pending).toBe(0);
  expect(usePersonFocus.getState().people["unavailable-photo"]).toBeUndefined();
});
