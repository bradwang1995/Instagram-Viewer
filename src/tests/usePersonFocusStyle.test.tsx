import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePersonFocusStyle } from "../hooks/usePersonFocusStyle";
import { usePersonFocus } from "../features/media/personFocus";
import { detectPerson } from "../features/media/personDetector";
vi.mock("../features/media/personDetector", () => ({ detectPerson: vi.fn() }));
beforeEach(() => usePersonFocus.setState({ strength: 100 }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  usePersonFocus.setState({ strength: 100 });
  vi.clearAllMocks();
});
it("leaves loaded photos original without starting detection at zero", async () => {
  usePersonFocus.setState({ strength: 0 });
  const ref = { current: new Image() };
  const { result } = renderHook(() => usePersonFocusStyle(ref, "photo", true));
  await act(async () => {});
  expect(result.current).toEqual({ transition: "none" });
  expect(detectPerson).not.toHaveBeenCalled();
});
it("disables the zoom animation and ignores a result after focus is switched off", async () => {
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
  const { result } = renderHook(() => usePersonFocusStyle(ref, "photo", true));
  expect(result.current?.transition).toBe("none");
  const signal = vi.mocked(detectPerson).mock.calls[0][3];
  act(() => usePersonFocus.setState({ strength: 0 }));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    complete([{ originX: 100, originY: 200, width: 200, height: 500 }]),
  );
  expect(result.current).toEqual({ transition: "none" });
});
it("applies a detected crop immediately and cancels work when the card unmounts", async () => {
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
  const ref = { current: image };
  const { result, unmount } = renderHook(() =>
    usePersonFocusStyle(ref, "photo", true),
  );
  await waitFor(() => expect(result.current?.transform).toContain("scale("));
  expect(result.current?.transition).toBe("none");
  const signal = vi.mocked(detectPerson).mock.calls[0][3];
  unmount();
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
  expect(result.current?.transform).toContain("scale(1)");
  expect(result.current?.transition).toBe("none");
  expect(result.current).not.toHaveProperty("objectFit");
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
  await waitFor(() => expect(result.current?.transform).toContain("scale("));
  const full = result.current?.transform;
  act(() => usePersonFocus.setState({ strength: 50 }));
  expect(result.current?.transform).not.toEqual(full);
  expect(detectPerson).toHaveBeenCalledTimes(1);
  act(() => usePersonFocus.setState({ strength: 0 }));
  expect(result.current).toEqual({ transition: "none" });
});
