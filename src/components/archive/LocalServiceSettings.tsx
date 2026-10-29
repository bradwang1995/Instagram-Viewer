import { useEffect, useState } from "react";
import {
  connectLocalService,
  localServiceEnabled,
  setLocalService,
} from "../../features/media/personalMedia";

export function LocalServiceButton() {
  if (import.meta.env.MODE === "personal") return null;
  return (
    <button
      className="viewer-control"
      type="button"
      onClick={() => window.dispatchEvent(new Event("viewer:local-settings"))}
    >
      Local server
    </button>
  );
}

export function LocalServiceSettings() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [offline, setOffline] = useState(false);
  const enabled = localServiceEnabled();
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("viewer:local-settings", show);
    return () => window.removeEventListener("viewer:local-settings", show);
  }, []);
  useEffect(() => {
    if (!enabled || import.meta.env.MODE === "personal") return;
    let active = true;
    let checking = false;
    async function check() {
      if (checking) return;
      checking = true;
      try {
        const changed = await connectLocalService();
        if (active) {
          setOffline(false);
          if (changed) window.location.reload();
        }
      } catch {
        if (active) setOffline(true);
      } finally {
        checking = false;
      }
    }
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [open]);
  async function connect() {
    setBusy(true);
    setMessage(
      "Connecting… If your browser asks for local network access, allow it.",
    );
    try {
      await connectLocalService();
      setLocalService(true);
      window.location.reload();
    } catch {
      setMessage(
        "Cannot connect. Start Personal Viewer.cmd, then allow local network access in your browser and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {offline ? (
        <div className="local-server-notice" role="status">
          Local server is offline. Start Personal Viewer.cmd.
          <button className="viewer-control" onClick={() => setOpen(true)}>
            Settings
          </button>
        </div>
      ) : null}
      {open ? (
        <div className="local-server-overlay" onClick={() => setOpen(false)}>
          <section
            className="local-server-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Local server settings"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Local server</h2>
            <p>
              Use the OG service on this PC. This setting applies only to this
              browser.
            </p>
            <p>
              {enabled
                ? "Local service enabled"
                : "Default media service enabled"}
            </p>
            <p>
              Start Personal Viewer.cmd before connecting. Your browser may ask
              for local network access.
            </p>
            {message ? <p role="status">{message}</p> : null}
            <div className="local-server-actions">
              <button
                autoFocus
                className="viewer-control"
                disabled={busy}
                onClick={() => void connect()}
              >
                {busy
                  ? "Connecting…"
                  : enabled
                    ? "Reconnect"
                    : "Connect to this PC"}
              </button>
              {enabled ? (
                <button
                  className="viewer-control"
                  onClick={() => {
                    setLocalService(false);
                    window.location.reload();
                  }}
                >
                  Use default service
                </button>
              ) : null}
              <button className="viewer-control" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
