import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmbedLab } from "../pages/EmbedLab";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("preloads one post from the project JSON, ignoring reels and duplicate links", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { href: "https://www.instagram.com/reel/REEL/" },
          {
            href: "https://www.instagram.com/p/ONE/",
            value: "https://www.instagram.com/p/ONE/",
          },
          { href: "https://www.instagram.com/p/TWO/" },
        ],
      }),
  );
  render(<EmbedLab />);
  await waitFor(() =>
    expect(screen.getByTitle("Instagram 实验帖子")).toHaveAttribute(
      "src",
      "https://www.instagram.com/p/ONE/embed/",
    ),
  );
  expect(screen.getAllByTitle("Instagram 实验帖子")).toHaveLength(1);
  expect(screen.getByLabelText("当前帖子")).toHaveValue(
    "https://www.instagram.com/p/ONE/",
  );
  fireEvent.change(screen.getByLabelText("展示方式"), {
    target: { value: "index" },
  });
  expect(screen.getByTitle("Instagram 实验帖子")).toHaveAttribute(
    "src",
    "https://www.instagram.com/p/ONE/embed/?img_index=2",
  );
  vi.useFakeTimers();
  fireEvent.click(
    screen.getByRole("button", { name: "每 2 秒切换 img_index=1 / 2" }),
  );
  expect(screen.getByTitle("Instagram 实验帖子")).toHaveAttribute(
    "src",
    "https://www.instagram.com/p/ONE/embed/?img_index=1",
  );
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByTitle("Instagram 实验帖子")).toHaveAttribute(
    "src",
    "https://www.instagram.com/p/ONE/embed/?img_index=2",
  );
  fireEvent.click(screen.getByRole("button", { name: "停止参数轮播" }));
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByTitle("Instagram 实验帖子")).toHaveAttribute(
    "src",
    "https://www.instagram.com/p/ONE/embed/?img_index=2",
  );
});

it("reports JSON loading failure and keeps manual input available", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  render(<EmbedLab />);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("HTTP 404"),
  );
  fireEvent.change(screen.getByLabelText("当前帖子"), {
    target: { value: "https://www.instagram.com/p/MANUAL/" },
  });
  fireEvent.click(screen.getByRole("button", { name: "载入帖子" }));
  expect(screen.getByTitle("Instagram 实验帖子")).toHaveAttribute(
    "src",
    "https://www.instagram.com/p/MANUAL/embed/",
  );
});
