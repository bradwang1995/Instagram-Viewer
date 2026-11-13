import type { AdEvent } from "../telemetry";
import type { MockOutcome, VideoResult } from "../types";

export async function playMock(
  outcome: MockOutcome,
  signal: AbortSignal,
  event: (name: AdEvent) => void,
): Promise<VideoResult> {
  if (outcome === "blocked") return { failure: outcome };
  event("sdk_loaded");
  if (outcome === "no_fill" || outcome === "cap" || outcome === "unavailable")
    return { failure: outcome };
  event("ad_request_success");
  event("ad_started");
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 650);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
  if (signal.aborted) return { failure: "cancelled" };
  return outcome === "rewarded"
    ? { reward: "mock-reward" }
    : { failure: outcome };
}
