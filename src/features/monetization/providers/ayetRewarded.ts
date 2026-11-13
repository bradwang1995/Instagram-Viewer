import type { AdEvent } from "../telemetry";
import type { Failure, VideoResult } from "../types";

type SDK = {
  init(
    placementId: number,
    externalIdentifier: string,
    optionalParameter: null,
  ): Promise<void>;
  requestAd(
    slot: string,
    success: () => void,
    failure: (message: unknown) => void,
  ): void;
  isAdAvailable(): boolean;
  playFullsizeAd(): void;
  destroy(): void;
  callbackError?: (error: unknown) => void;
  callbackPlaying?: () => void;
  callbackComplete?: () => void;
  callbackRewarded?: (details: unknown) => void;
};
declare global {
  interface Window {
    AyetVideoSdk?: SDK;
  }
}

let loading: Promise<SDK> | undefined;
let active = false;
let initialized: { sdk: SDK; placement: number; id: string } | undefined;

function loadSdk() {
  loading ??= new Promise<SDK>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.ayet.io/offerwall/js/ayetvideosdk.min.js";
    script.referrerPolicy = "no-referrer";
    const finish = (sdk?: SDK) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (sdk) resolve(sdk);
      else {
        script.remove();
        reject(new Error("SDK unavailable"));
      }
    };
    const timer = setTimeout(() => finish(), 10_000);
    script.onload = () => finish(window.AyetVideoSdk);
    script.onerror = () => finish();
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    const cleanup = () => signal.removeEventListener("abort", abort);
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function prepareAyet(
  placement: number,
  id: string,
  signal: AbortSignal,
  event: (name: AdEvent) => void,
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  const sdk = await abortable(loadSdk(), deadline);
  event("sdk_loaded");
  if (
    initialized?.sdk !== sdk ||
    initialized.placement !== placement ||
    initialized.id !== id
  ) {
    await abortable(sdk.init(placement, id, null), deadline);
    initialized = { sdk, placement, id };
  }
  return sdk;
}

// Called synchronously in the click handler once the SDK is ready.
export function playAyet(
  sdk: SDK,
  slot: string,
  signal: AbortSignal,
  event: (name: AdEvent) => void,
): Promise<VideoResult> {
  if (active || signal.aborted)
    return Promise.resolve({ failure: "cancelled" });
  active = true;
  return new Promise((resolve) => {
    let settled = false;
    let phase: "request" | "play" | "complete" = "request";
    let deadline = setTimeout(() => fail("unavailable"), 15_000);
    function finish(result: VideoResult) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal.removeEventListener("abort", cancel);
      sdk.callbackError =
        sdk.callbackPlaying =
        sdk.callbackComplete =
        sdk.callbackRewarded =
          undefined;
      try {
        sdk.destroy();
      } catch {
        /* The wrapper still owns its cleanup. */
      }
      active = false;
      resolve(result);
    }
    function fail(failure: Failure) {
      finish({ failure });
    }
    function cancel() {
      fail("cancelled");
    }
    signal.addEventListener("abort", cancel, { once: true });
    sdk.callbackError = () => fail("unavailable");
    sdk.callbackPlaying = () => {
      if (phase === "play") event("ad_started");
    };
    sdk.callbackRewarded = (reward) => {
      if (phase !== "request") finish({ reward });
    };
    sdk.callbackComplete = () => {
      if (phase !== "play") return;
      phase = "complete";
      clearTimeout(deadline);
      deadline = setTimeout(() => fail("complete"), 8_000);
    };
    try {
      sdk.requestAd(
        slot,
        () => {
          if (settled || phase !== "request") return;
          try {
            if (!sdk.isAdAvailable()) return fail("unavailable");
            phase = "play";
            event("ad_request_success");
            clearTimeout(deadline);
            deadline = setTimeout(() => fail("unavailable"), 300_000);
            sdk.playFullsizeAd();
          } catch {
            fail("unavailable");
          }
        },
        (message) => {
          if (phase !== "request") return;
          const error =
            typeof message === "string" ? message.trim().toLowerCase() : "";
          fail(
            /^no fill\.?$/.test(error)
              ? "no_fill"
              : /^cap reached\.?$/.test(error)
                ? "cap"
                : "unavailable",
          );
        },
      );
    } catch {
      fail("unavailable");
    }
  });
}
