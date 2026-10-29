import { afterEach, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  LocalServiceSettings,
  LocalServiceButton,
} from "../components/archive/LocalServiceSettings";
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("shows local service startup guidance when connecting fails without enabling the browser setting", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  render(
    <>
      <LocalServiceButton />
      <LocalServiceSettings />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Local server" }));
  fireEvent.click(screen.getByRole("button", { name: "Connect to this PC" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Start Personal Viewer.cmd",
    ),
  );
  expect(localStorage.length).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
