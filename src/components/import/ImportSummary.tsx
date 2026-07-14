import type { ImportJob } from "../../db/schema";
import { formatDateTime } from "../../utils/date";

export function ImportSummary({ job }: { job: ImportJob | undefined }) {
  if (!job) {
    return null;
  }

  return (
    <section className="summary-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{job.status}</div>
          <h2>Import summary</h2>
        </div>
        <span className="pill">{formatDateTime(job.finishedAt ?? job.startedAt)}</span>
      </div>

      {job.error ? <p className="error-text">{job.error}</p> : null}

      <div className="stats-grid">
        <Stat label="Scanned files" value={job.totalFilesScanned} />
        <Stat label="JSON files" value={job.totalJsonFilesScanned} />
        <Stat label="HTML files" value={job.totalHtmlFilesScanned} />
        <Stat label="URLs found" value={job.totalUrlsFound} />
        <Stat label="Unique posts" value={job.totalUniquePostsFound} />
        <Stat label="New posts" value={job.totalNewPostsAdded} />
        <Stat label="Updated posts" value={job.totalExistingPostsUpdated} />
        <Stat label="Warnings" value={job.warnings.length} />
      </div>

      {job.warnings.length > 0 ? (
        <div className="warning-list">
          {job.warnings.map((warning, index) => (
            <div className="warning-item" key={`${warning.code}-${index}`}>
              <strong>{warning.code}</strong>
              <span>{warning.message}</span>
              {warning.sourceFilePath ? <code>{warning.sourceFilePath}</code> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}
