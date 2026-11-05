import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSuperResolution } from "../hooks/useSuperResolution";
import { usePersonFocus } from "../features/media/personFocus";
import { enhancePhoto } from "../features/media/superResolution";
vi.mock("../features/media/superResolution", () => ({ enhancePhoto: vi.fn() }));
beforeEach(() => {
  usePersonFocus.setState({
    superResolution: true,
    enhancing: 0,
    enhancementError: undefined,
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: (entries: unknown[]) => void) {}
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  usePersonFocus.setState({ superResolution: false, enhancing: 0 });
});
it("passes the loaded photo and clears pending work when switched off, ignoring late output", async () => {
  let finish!: (result: { url: string }) => void;
  vi.mocked(enhancePhoto).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const image = new Image();
  const ref = { current: image };
  const { result } = renderHook(() => useSuperResolution(ref, "photo", true));
  await waitFor(() => expect(enhancePhoto).toHaveBeenCalledOnce());
  expect(enhancePhoto).toHaveBeenCalledWith(
    "photo",
    expect.any(AbortSignal),
    expect.any(Function),
    image,
  );
  expect(usePersonFocus.getState().enhancing).toBe(1);
  const signal = vi.mocked(enhancePhoto).mock.calls[0][1];
  act(() => usePersonFocus.setState({ superResolution: false }));
  expect(signal.aborted).toBe(true);
  expect(usePersonFocus.getState().enhancing).toBe(0);
  await act(async () => finish({ url: "blob:late" }));
  expect(result.current).toBeUndefined();
});
it("releases processing state after failure and retains the original instead of claiming completion", async () => {
  vi.mocked(enhancePhoto).mockResolvedValue({ error: "Photo unavailable" });
  const ref = { current: new Image() };
  const { result } = renderHook(() => useSuperResolution(ref, "photo", true));
  await waitFor(() => expect(result.current?.error).toBe("Photo unavailable"));
  expect(result.current?.url).toBeUndefined();
  expect(usePersonFocus.getState().enhancing).toBe(0);
  expect(usePersonFocus.getState().enhancementError).toBe("Photo unavailable");
});
