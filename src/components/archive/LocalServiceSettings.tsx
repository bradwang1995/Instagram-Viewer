import { X, Monitor, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const dialogRef = useRef<HTMLElement>(null);
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
    dialogRef.current?.focus({ preventScroll: true });
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
      await connectLocalService(30_000);
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
            ref={dialogRef}
            tabIndex={-1}
            className="local-server-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Local server settings"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="viewer-control dialog-close"
              aria-label="Close local server settings"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <div className="local-server-heading">
              <Monitor size={26} />
              <h2>Local server</h2>
            </div>

            <p className="local-server-intro">
              Choose how this browser loads your Instagram photos. Use the
              online service for everyday viewing, or connect to a service
              running on this PC.
            </p>
            <p className="local-server-state">
              {enabled
                ? "Local service enabled"
                : "Default media service enabled"}
            </p>
            <div className="media-service-options">
              <section
                className={
                  "media-service-option" + (!enabled ? " is-selected" : "")
                }
                aria-label="Online service"
              >
                <div className="media-service-title">
                  <Globe size={22} />
                  <h3>Online service</h3>
                  <span>{!enabled ? "Selected" : "Default"}</span>
                </div>
                <p>
                  No local setup needed. Photos load through the default online
                  service while it is available.
                </p>
                <button
                  className="viewer-control"
                  disabled={!enabled || busy}
                  onClick={() => {
                    setLocalService(false);
                    window.location.reload();
                  }}
                >
                  {enabled ? "Use default service" : "Currently selected"}
                </button>
              </section>
              <section
                className={
                  "media-service-option" + (enabled ? " is-selected" : "")
                }
                aria-label="Service on this PC"
              >
                <div className="media-service-title">
                  <Monitor size={22} />
                  <h3>On this PC</h3>
                  <span>{enabled ? "Selected" : "Local"}</span>
                </div>
                <p>
                  A local alternative when the online service is unavailable, or
                  when you prefer to run your own service.
                </p>
                <ol className="local-server-steps">
                  <li>
                    Run <strong>Start Personal Viewer.cmd</strong> in your local
                    project folder.
                  </li>
                  <li>
                    Keep the service running, then connect below. Allow local
                    network access if your browser asks.
                  </li>
                </ol>
                <button
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
              </section>
            </div>
            {message ? (
              <p className="local-server-feedback" role="status">
                {message}
              </p>
            ) : null}
            <p className="local-server-footnote">
              Your choice is saved only in this browser. Keep the local service
              running while viewing; you can return here to switch back to the
              online service.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}
