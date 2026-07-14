import { useState } from "react";
import type { ImportJob } from "../db/schema";
import { importInstagramZip } from "../features/import/importZip";
import { ImportSummary } from "../components/import/ImportSummary";
import { ManualUrlImport } from "../components/import/ManualUrlImport";
import { ZipImportDropzone } from "../components/import/ZipImportDropzone";

export function ImportPage() {
  const [isImporting, setIsImporting] = useState(false);
  const [latestJob, setLatestJob] = useState<ImportJob | undefined>();

  async function handleImport(file: File) {
    setIsImporting(true);

    try {
      const job = await importInstagramZip(file);
      setLatestJob(job);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <div className="eyebrow">local-first import</div>
          <h1>Build your saved library</h1>
        </div>
        <p>
          No Instagram login, password, cookies, or scraping. The app stores saved
          post references, local notes, tags, and import metadata in this browser.
        </p>
      </section>

      <div className="split-grid">
        <ZipImportDropzone isImporting={isImporting} onImport={handleImport} />
        <ManualUrlImport />
      </div>

      <ImportSummary job={latestJob} />
    </div>
  );
}
