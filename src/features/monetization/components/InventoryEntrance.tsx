import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { createAccessClient, guestToken } from "../access/accessClient";
import { config } from "../config";
import { getConsent, subscribeConsent } from "../consent";
import { approvedInventory } from "../providers/approvedInventory";
import {
  chooseInventory,
  reserveInventory,
  type Inventory,
} from "../providers/inventory";

export function InventoryEntrance({ children }: PropsWithChildren) {
  const access = useMemo(() => createAccessClient(config.apiOrigin), []);
  const consent = useSyncExternalStore(subscribeConsent, getConsent);
  const [entered, setEntered] = useState(false);
  const [unit, setUnit] = useState<Inventory | null>(null);
  const [status, setStatus] = useState("");
  const [eligible, setEligible] = useState(false);
  const [pending, setPending] = useState(false);
  const requested = useRef(false);
  const continued = useRef(false);
  const context = {
    ...config,
    surface: "entrance" as const,
    entitled: false,
    // Replace with an approved audience/site eligibility integration before adult inventory.
    approvedAdultAudienceAndSite: false,
    consent,
  };
  useEffect(() => {
    if (
      entered ||
      !approvedInventory.length ||
      (!consent.adsterra && !consent.exoclick)
    )
      return;
    const controller = new AbortController();
    void access
      .status(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setEligible(!next.entitlement);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      setEligible(false);
    };
  }, [access, entered, consent.adsterra, consent.exoclick]);

  if (entered || !approvedInventory.length) return <>{children}</>;
  const available =
    eligible && Boolean(chooseInventory(approvedInventory, context, "", false));
  const visible = eligible && unit && chooseInventory([unit], context, "");

  async function show() {
    if (!eligible || requested.current) return;
    requested.current = true;
    setPending(true);
    setStatus("");
    try {
      const { entitlement } = await access.status(AbortSignal.timeout(10_000));
      if (entitlement || continued.current) {
        setEligible(false);
        return;
      }
      if (!navigator.locks) throw new Error("Inventory cap unavailable");
      const selected = await navigator.locks.request(
        "instagram-viewer:inventory",
        () => {
          if (continued.current) return null;
          const candidate = chooseInventory(
            approvedInventory,
            { ...context, consent: getConsent() },
            guestToken(),
            config.inventoryExperiment,
          );
          return candidate &&
            reserveInventory(localStorage, Date.now(), config.inventoryCapMs)
            ? candidate
            : null;
        },
      );
      if (!continued.current) {
        setUnit(selected);
        setStatus(
          selected
            ? ""
            : "Sponsored content is currently unavailable or frequency limited.",
        );
      }
    } catch {
      if (!continued.current)
        setStatus("Sponsored content could not be loaded.");
    } finally {
      requested.current = false;
      if (!continued.current) setPending(false);
    }
  }

  return (
    <section
      className="monetization-entrance"
      aria-label="Instagram Viewer entrance"
    >
      <div className="monetization-card">
        <h1>Instagram Viewer</h1>
        {available && (
          <p>
            Optional sponsored content may request data from third-party
            advertising services.
          </p>
        )}
        {available && !visible && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              void show();
            }}
          >
            {pending ? "Checking availability…" : "Show sponsored content"}
          </button>
        )}
        {visible && (
          <iframe
            title="Sponsored content"
            srcDoc={visible.approvedHtml}
            sandbox={
              visible.format === "popunder"
                ? "allow-scripts allow-popups"
                : "allow-scripts"
            }
            referrerPolicy="no-referrer"
          />
        )}
        <button
          type="button"
          onClick={() => {
            continued.current = true;
            setEntered(true);
          }}
        >
          Continue to viewer
        </button>
        <p role="status">{status}</p>
      </div>
    </section>
  );
}
