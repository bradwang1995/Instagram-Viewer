import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePersonFocusStyle } from "../hooks/usePersonFocusStyle";
import { usePersonFocus } from "../features/media/personFocus";
import { detectPerson } from "../features/media/personDetector";
vi.mock("../features/media/personDetector", () => ({ detectPerson: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  usePersonFocus.setState({ enabled: true });
  vi.clearAllMocks();
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
  act(() => usePersonFocus.setState({ enabled: false }));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    complete([{ originX: 100, originY: 200, width: 200, height: 500 }]),
  );
  expect(result.current).toBeUndefined();
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
