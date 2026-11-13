import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { config } from "../config";
import { getConsent, subscribeConsent } from "../consent";
import {
  createAccessClient,
  MOCK_KEY,
  mockGrant,
  mockStatus,
} from "../access/accessClient";
import { accessDeadline, remainingAccess } from "../access/accessState";
import { playAyet, prepareAyet } from "../providers/ayetRewarded";
import { playMock } from "../providers/mockRewarded";
import { createTelemetry } from "../telemetry";
import type { AccessStatus, Failure, MockOutcome } from "../types";
import { InventoryEntrance } from "./InventoryEntrance";
import "./monetization.css";

const telemetry = createTelemetry(
  () => config.mode === "live" && getConsent().analytics,
);
const event = telemetry.record;

const failureCopy: Record<Failure, string> = {
  no_fill: "No video is available right now.",
  cap: "The provider’s video limit has been reached.",
  blocked:
    "The video service could not load. Check your connection or content blocker.",
  cancelled: "The video was cancelled.",
  complete: "The video ended without a verified reward.",
  unavailable: "The video is unavailable or the connection timed out.",
  verification:
    "We couldn’t verify the reward. Check access status or try again.",
};
const demoOutcomes: MockOutcome[] = [
  "rewarded",
  ...(Object.keys(failureCopy) as Failure[]),
];
const accessUnavailable =
  "Access service is temporarily unavailable. You can continue to the viewer.";

export function MonetizationGate({ children }: PropsWithChildren) {
  if (config.inventory)
    return <InventoryEntrance>{children}</InventoryEntrance>;
  if (config.mode === "disabled") return <>{children}</>;
  return <AccessEntrance>{children}</AccessEntrance>;
}

function AccessEntrance({ children }: PropsWithChildren) {
  const mock = config.mode === "mock";
  const client = useMemo(() => createAccessClient(config.apiOrigin), []);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [continueWithoutService, setContinueWithoutService] = useState(false);
  const consent = useSyncExternalStore(subscribeConsent, getConsent);
  const [status, setStatus] = useState<AccessStatus | null>(() =>
    mock ? mockStatus() : null,
  );
  const [deadline, setDeadline] = useState(() =>
    status ? accessDeadline(status, performance.now()) : 0,
  );
  const [clock, setClock] = useState(() => performance.now());
  const [busy, setBusy] = useState<
    "prepare" | "video" | "verify" | "check" | null
  >(null);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<MockOutcome>("rewarded");
  const [sdk, setSdk] = useState<Awaited<
    ReturnType<typeof prepareAyet>
  > | null>(null);
  const [premium, setPremium] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const adOperation = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const entered = useRef(false);
  const visitRecorded = useRef(false);
  const gateRecorded = useRef(false);
  const statusDialog = useRef<HTMLDialogElement>(null);
  const statusButton = useRef<HTMLButtonElement>(null);
  const refreshVersion = useRef(0);
  const watched = useRef(false);
  const left = useRef(false);
  const hasAccess = Boolean(
    status?.entitlement && remainingAccess(deadline, clock),
  );
  const eligible = mock || consent.rewarded;
  const servicePaused = status?.rewardedAvailable === false;

  function accept(next: AccessStatus) {
    const now = performance.now();
    setServiceUnavailable(false);
    setMessage((previous) => (previous === accessUnavailable ? "" : previous));
    setStatus(next);
    setDeadline(accessDeadline(next, now));
    setClock(now);
  }

  useEffect(() => {
    const controller = new AbortController();
    const version = ++refreshVersion.current;
    if (!mock) {
      void client
        .status(controller.signal)
        .then((next) => {
          if (controller.signal.aborted || refreshVersion.current !== version)
            return;
          accept(next);
          if (next.entitlement) {
            event("access_restored");
            event("returning_session");
          }
        })
        .catch(() => {
          if (
            !controller.signal.aborted &&
            refreshVersion.current === version
          ) {
            setServiceUnavailable(true);
            setMessage(accessUnavailable);
          }
        });
    }
    const refresh = () => {
      setClock(performance.now());
      if (mock) accept(mockStatus());
      else if (!operation.current && document.visibilityState === "visible") {
        const currentVersion = ++refreshVersion.current;
        void client
          .status(controller.signal)
          .then((next) => {
            if (
              !controller.signal.aborted &&
              !operation.current &&
              refreshVersion.current === currentVersion
            )
              accept(next);
          })
          .catch(() => {});
      }
    };
    const storage = (e: StorageEvent) => {
      if (e.key === MOCK_KEY) refresh();
    };
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, mock]);

  useEffect(() => {
    if (entered.current && !hasAccess) event("access_expired");
    entered.current = hasAccess;
    if (hasAccess) {
      gateRecorded.current = false;
      if (document.activeElement === document.body)
        statusButton.current?.focus();
      const tick = () => setClock(performance.now());
      const interval = window.setInterval(tick, 30_000);
      const expiry = window.setTimeout(
        tick,
        Math.min(2_147_483_647, remainingAccess(deadline, performance.now())),
      );
      return () => {
        clearInterval(interval);
        clearTimeout(expiry);
      };
    }
    if (mock || status || serviceUnavailable) heading.current?.focus();
    if (!gateRecorded.current && (mock || status || serviceUnavailable)) {
      gateRecorded.current = true;
      watched.current = false;
      left.current = false;
      event("gate_shown");
    }
    const exit = () => {
      if (gateRecorded.current && !watched.current && !left.current)
        event("exit_before_ad");
      left.current = true;
    };
    window.addEventListener("pagehide", exit);
    return () => window.removeEventListener("pagehide", exit);
  }, [hasAccess, deadline, mock, Boolean(status), serviceUnavailable]);

  useEffect(() => {
    if (!consent.analytics) {
      telemetry.clear();
      visitRecorded.current = false;
    } else if (!visitRecorded.current) {
      visitRecorded.current = true;
      event("visit");
    }
  }, [consent.analytics]);

  useEffect(() => {
    if (!eligible) {
      adOperation.current?.abort();
      setSdk(null);
    }
  }, [eligible]);

  useEffect(
    () => () => {
      operation.current?.abort();
      operation.current = null;
    },
    [],
  );

  function run(
    kind: NonNullable<typeof busy>,
    task: (signal: AbortSignal) => Promise<void>,
  ) {
    if (operation.current) return;
    const controller = new AbortController();
    refreshVersion.current++;
    operation.current = controller;
    if (kind !== "check") adOperation.current = controller;
    setBusy(kind);
    setMessage("");
    void task(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted) setMessage(failureCopy.unavailable);
      })
      .finally(() => {
        if (operation.current !== controller) return;
        operation.current = null;
        adOperation.current = null;
        setBusy(null);
      });
  }

  async function fallback(signal: AbortSignal) {
    const next = mock
      ? mockGrant("no_fill_temporary")
      : await client.fallback(signal);
    if (signal.aborted) return;
    accept(next);
    if (next.entitlement?.type === "no_fill_temporary") {
      setMessage("Temporary access is available for one hour.");
      event("no_fill_access");
    } else if (!next.entitlement)
      setMessage("Temporary access is currently unavailable.");
  }

  function watch() {
    if (
      servicePaused ||
      !eligible ||
      (!mock && !getConsent().rewarded) ||
      operation.current
    )
      return;
    if (!mock && !sdk) {
      run("prepare", async (signal) => {
        try {
          const id = await client.identifier(signal);
          signal.throwIfAborted();
          if (!getConsent().rewarded) return;
          const ready = await prepareAyet(
            config.placementId,
            id,
            signal,
            event,
          );
          if (!signal.aborted) setSdk(ready);
        } catch {
          if (!signal.aborted) setMessage(failureCopy.blocked);
        }
      });
      return;
    }
    event("watch_clicked");
    run("video", async (signal) => {
      const videoEvent: typeof event = (name) => {
        if (name === "ad_started") watched.current = true;
        event(name);
      };
      const result = await (sdk
        ? playAyet(sdk, config.slot, signal, videoEvent)
        : playMock(outcome, signal, videoEvent));
      if (signal.aborted) return;
      if ("failure" in result) {
        if (result.failure === "complete") event("ad_completed_no_reward");
        if (result.failure === "no_fill") event("ad_no_fill");
        setMessage(failureCopy[result.failure]);
        if (
          config.noFillPolicy === "allow_access" &&
          ["no_fill", "cap"].includes(result.failure)
        ) {
          await fallback(signal);
        }
        return;
      }
      event("reward_received");
      setBusy("verify");
      try {
        const verified =
          mock && result.reward === "mock-reward"
            ? { status: mockGrant("free_rewarded"), issued: true }
            : await client.reward(signal, result.reward);
        if (signal.aborted) return;
        event("reward_verified");
        if (verified.issued) event("grant_issued");
        accept(verified.status);
        setMessage(
          verified.status.entitlement
            ? "Access granted."
            : failureCopy.verification,
        );
      } catch {
        if (signal.aborted) return;
        event("reward_rejected");
        setMessage(failureCopy.verification);
      }
    });
  }

  function reset() {
    localStorage.removeItem(MOCK_KEY);
    statusDialog.current?.close();
    accept(mockStatus());
    setMessage("");
  }

  function cancel() {
    operation.current?.abort();
    setMessage(failureCopy.cancelled);
  }

  if (continueWithoutService) return <>{children}</>;

  if (hasAccess && status?.entitlement) {
    const minutes = Math.ceil(remainingAccess(deadline, clock) / 60_000);
    return (
      <>
        {children}
        <aside className="monetization-status" aria-label="Access">
          <button
            type="button"
            ref={statusButton}
            aria-haspopup="dialog"
            onClick={() => statusDialog.current?.showModal()}
          >
            Access status
          </button>
          <dialog
            ref={statusDialog}
            aria-labelledby="monetization-status-title"
            onClose={() => statusButton.current?.focus()}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.stopPropagation();
            }}
          >
            <h2 id="monetization-status-title">Access status</h2>
            <p>
              {status.entitlement.type === "no_fill_temporary"
                ? "Temporary access"
                : status.entitlement.type === "premium"
                  ? "Premium access"
                  : mock
                    ? "Demo access"
                    : "Rewarded access"}
            </p>
            <p>
              {Math.floor(minutes / 60)}h {minutes % 60}m remaining
            </p>
            <div className="monetization-dialog-actions">
              {mock && (
                <button type="button" onClick={reset}>
                  Reset demo access
                </button>
              )}
              <button
                type="button"
                onClick={() => statusDialog.current?.close()}
              >
                Close
              </button>
            </div>
          </dialog>
          <span className="sr-only" role="status">
            {message}
          </span>
        </aside>
      </>
    );
  }

  return (
    <section
      className="monetization-entrance"
      aria-labelledby="monetization-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && busy) cancel();
      }}
    >
      <div className="monetization-card">
        <h1 id="monetization-title" ref={heading} tabIndex={-1}>
          {mock ? "Instagram Viewer access demo" : "Access Instagram Viewer"}
        </h1>
        <p>
          {mock
            ? "Try the access flow with a simulated video."
            : "Watch a rewarded video for 24 hours of ad-free viewing."}
        </p>
        {!mock && (
          <p>
            With your consent, ayeT-Studios and its ad partners may process
            device data and use cookies. Your saved posts stay in your viewer.
          </p>
        )}
        {mock && (
          <label>
            Simulated outcome{" "}
            <select
              value={outcome}
              disabled={Boolean(busy)}
              onChange={(e) => setOutcome(e.target.value as MockOutcome)}
            >
              {demoOutcomes.map((item) => (
                <option key={item} value={item}>
                  {item.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        )}
        {!eligible && <p>Ad consent is required to load the video.</p>}
        <div className="monetization-actions">
          <button
            className="monetization-primary"
            type="button"
            disabled={
              Boolean(busy) || !eligible || servicePaused || (!mock && !status)
            }
            onClick={watch}
          >
            {mock || sdk
              ? "Watch an Ad — Free access for 24 hours"
              : "Prepare rewarded video"}
          </button>
          {busy && (
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          )}
          {!mock && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                run("check", async (signal) => {
                  let next: AccessStatus;
                  try {
                    next = await client.status(signal);
                  } catch {
                    if (!signal.aborted) {
                      setServiceUnavailable(true);
                      setMessage(accessUnavailable);
                    }
                    return;
                  }
                  if (signal.aborted) return;
                  accept(next);
                  if (!next.entitlement)
                    setMessage("No active access was found.");
                })
              }
            >
              Check access status
            </button>
          )}
          {(serviceUnavailable || servicePaused) && (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => setContinueWithoutService(true)}
            >
              Continue to viewer
            </button>
          )}
          {!mock &&
            status &&
            !serviceUnavailable &&
            !servicePaused &&
            config.noFillPolicy === "allow_access" && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run("check", fallback)}
              >
                Continue with temporary access
              </button>
            )}
        </div>
        <p role="status">
          {busy
            ? {
                prepare: "Preparing video…",
                video: "Waiting for video…",
                verify: "Verifying reward…",
                check: "Checking access…",
              }[busy]
            : (servicePaused
                ? "Rewarded video is paused. You can continue to the viewer."
                : message) ||
              (!mock && !status
                ? "Checking access…"
                : sdk
                  ? "Video service ready."
                  : "")}
        </p>
        {config.premiumInfo && (
          <button
            type="button"
            aria-expanded={premium}
            onClick={() => {
              if (!premium) event("premium_stub_seen");
              setPremium(!premium);
            }}
          >
            Premium — Coming later
          </button>
        )}
        {premium && <p>Premium subscriptions are not available yet.</p>}
      </div>
    </section>
  );
}
