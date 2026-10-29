import { useEffect, useRef, useState } from "react";
import { readLoadReport } from "../../features/media/loadReport";

export function LoadReport() {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [rows, setRows] = useState(readLoadReport);
  useEffect(() => {
    const update = () => setRows(readLoadReport());
    const show = () => {
      update();
      dialog.current?.showModal();
      title.current?.focus();
      if (dialog.current) dialog.current.scrollTop = 0;
    };
    window.addEventListener("viewer:show-load-report", show);
    window.addEventListener("viewer:load-report-updated", update);
    return () => {
      window.removeEventListener("viewer:show-load-report", show);
      window.removeEventListener("viewer:load-report-updated", update);
    };
  }, []);
  const failed = rows.filter((row) => row.outcome === "failed");
  const groups = new Map<string, number>();
  for (const row of failed) {
    const key = `${row.stage} · ${row.status ?? "unknown status"} · ${row.code}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const loaded = rows.length - failed.length;
  return (
    <dialog
      ref={dialog}
      className="local-server-dialog load-report"
      aria-label="Media load report"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <h2 ref={title} tabIndex={-1}>Load report</h2>
      <p>
        Latest result for up to 1,000 photos in this browser. Updated when a
        photo is tried again. Stored locally; no report is uploaded.
      </p>
      <p>
        Loaded: {loaded} · Failed: {failed.length} · Success:{" "}
        {rows.length ? Math.round((loaded / rows.length) * 100) : 0}%
      </p>
      <p>
        Failed photos are hidden for this visit. Reload the page to try them
        again.
      </p>
      {failed.length ? (
        <table>
          <thead>
            <tr>
              <th>Failure reason</th>
              <th>Photos</th>
              <th>Share of failures</th>
            </tr>
          </thead>
          <tbody>
            {[...groups]
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => (
                <tr key={reason}>
                  <td>{reason}</td>
                  <td>{count}</td>
                  <td>{Math.round((count / failed.length) * 100)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : (
        <p>No recorded failures.</p>
      )}
      <p>
        restricted: audience / age restriction; media_not_found / not_found:
        unavailable; graphql_error: Instagram could not resolve the post.
        Unknown image errors may include network or browser access failures.
      </p>
      <div className="local-server-actions">
        <button
          className="viewer-control"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      generatedAt: new Date().toISOString(),
                      scope: "latest result per photo, last 1000 photos",
                      rows,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "instagram-load-report.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Export JSON
        </button>
        <button
          className="viewer-control"
          onClick={() => dialog.current?.close()}
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
