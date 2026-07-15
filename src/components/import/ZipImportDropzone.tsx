import { FileArchive, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../common/Button";

type ZipImportDropzoneProps = {
  isImporting: boolean;
  onImport: (file: File) => Promise<void>;
};

export function ZipImportDropzone({
  isImporting,
  onImport,
}: ZipImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | undefined>();

  async function submit() {
    if (!selectedFile) {
      inputRef.current?.click();
      return;
    }

    await onImport(selectedFile);
    setSelectedFile(undefined);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <section className="import-panel">
      <div className="dropzone">
        <FileArchive size={32} aria-hidden="true" />
        <div>
          <h2>Import Instagram Saved Photos</h2>
          <p>
            Upload your official Instagram data export ZIP. The file is parsed
            locally in this browser.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => setSelectedFile(event.target.files?.[0])}
        />
      </div>

      {selectedFile ? (
        <div className="selected-file">
          <span>{selectedFile.name}</span>
          <span>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
      ) : null}

      <div className="button-row">
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          Choose ZIP
        </Button>
        <Button variant="primary" onClick={submit} disabled={isImporting}>
          <Upload size={16} aria-hidden="true" />
          {isImporting ? "Importing..." : "Import"}
        </Button>
      </div>
    </section>
  );
}
