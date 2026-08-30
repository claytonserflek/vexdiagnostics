import { useRef, useState } from "react";
import { importTest } from "../api";
import type { TestDetailResponse } from "../types";

export function UploadPanel({ onImported }: { onImported: (result: TestDetailResponse) => void }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const result = await importTest(file);
      onImported(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 className="card-title">Import a telemetry CSV</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
        Pull the SD card from the V5 Brain after running the standardized drivetrain test and drop the
        exported CSV here. See <code>docs/telemetry-csv-schema.md</code> for the exact format.
      </p>
      {error && <div className="notice error">{error}</div>}
      <div
        className={`upload-dropzone${dragging ? " dragging" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
      >
        {busy ? "Importing..." : "Drag & drop a CSV here, or click to choose a file"}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
    </div>
  );
}
