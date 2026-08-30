import { useRef, useState } from "react";
import { importTest } from "../api";
import type { TestDetailResponse } from "../types";
import { IconUpload } from "../components/Icons";

interface CsvPreview {
  testName: string | null;
  robotName: string | null;
  commandedCruiseRpm: string | null;
  trialCount: string | null;
  notes: string | null;
  motorLabels: string[];
}

/** Best-effort, read-only preview of the CSV's own metadata header lines
 * for the "verify configuration" step -- this is just an honest reading
 * of the file the user picked, not a re-implementation of validation.
 * The backend (backend/app/csv_import.py) remains the single source of
 * truth: the actual import in step 3 re-parses and validates for real,
 * and any problem the preview missed still surfaces as a real error. */
function previewCsvMetadata(text: string): CsvPreview {
  const meta: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("#")) continue;
    const content = line.slice(1).trim();
    const eq = content.indexOf("=");
    if (eq === -1) continue;
    meta[content.slice(0, eq).trim()] = content.slice(eq + 1).trim();
  }
  const motorLabels = (meta.motors ?? "")
    .split(",")
    .map((pair) => pair.split(":")[0]?.trim())
    .filter((label): label is string => !!label);
  return {
    testName: meta.test_name || null,
    robotName: meta.robot_name || null,
    commandedCruiseRpm: meta.commanded_cruise_rpm || null,
    trialCount: meta.trial_count || null,
    notes: meta.notes || null,
    motorLabels,
  };
}

type Stage = "select" | "ready" | "analyzing" | "error";

export function RunDiagnosticPage({ onComplete }: { onComplete: (result: TestDetailResponse) => void }) {
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    setFile(f);
    setError(null);
    try {
      const text = await f.text();
      setPreview(previewCsvMetadata(text));
      setStage("ready");
    } catch {
      setPreview(null);
      setStage("ready");
    }
  }

  async function runAnalysis() {
    if (!file) return;
    setStage("analyzing");
    setError(null);
    try {
      const result = await importTest(file);
      onComplete(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setStage("error");
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    setStage("select");
  }

  const step1Done = stage !== "select";
  const step2Done = stage === "analyzing" || stage === "error";

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Run Drivetrain Diagnostic</h1>
        <p className="page-subtitle">
          Run a standardized drivetrain test and analyze motor telemetry for abnormal mechanical resistance.
        </p>
      </div>

      <div className="panel">
        <div className="step-list">
          <div className="step">
            <div className={`step-marker${step1Done ? " done" : " active"}`}>{step1Done ? "✓" : "1"}</div>
            <div className="step-body">
              <div className="step-title">Step 1</div>
              <div className="step-heading">Upload Telemetry</div>
              {stage === "select" ? (
                <div
                  className={`dropzone${dragging ? " dragging" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleFile(f);
                  }}
                >
                  <IconUpload style={{ color: "var(--text-tertiary)", marginBottom: 8 }} />
                  <div className="dropzone-title">Drag and drop a telemetry CSV, or click to browse</div>
                  <div className="dropzone-hint">Exported from the drivetrain test program via SD card</div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="visually-hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                    }}
                  />
                </div>
              ) : (
                <div className="flex-row" style={{ fontSize: "0.85rem" }}>
                  <span className="mono">{file?.name}</span>
                  <button type="button" className="btn ghost sm" onClick={reset}>
                    Change file
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="step">
            <div className={`step-marker${step2Done ? " done" : stage === "ready" ? " active" : ""}`}>
              {step2Done ? "✓" : "2"}
            </div>
            <div className="step-body">
              <div className="step-title">Step 2</div>
              <div className="step-heading">Verify Configuration</div>
              {stage === "select" ? (
                <p className="subtle" style={{ fontSize: "0.83rem" }}>
                  Upload a file to see its detected motors and test parameters.
                </p>
              ) : preview ? (
                <div className="config-grid">
                  <div className="config-item">
                    <div className="label">Test name</div>
                    <div className="value">{preview.testName ?? "—"}</div>
                  </div>
                  <div className="config-item">
                    <div className="label">Robot</div>
                    <div className="value">{preview.robotName ?? "—"}</div>
                  </div>
                  <div className="config-item">
                    <div className="label">Cruise speed</div>
                    <div className="value">{preview.commandedCruiseRpm ? `${preview.commandedCruiseRpm} RPM` : "—"}</div>
                  </div>
                  <div className="config-item">
                    <div className="label">Trials</div>
                    <div className="value">{preview.trialCount ?? "—"}</div>
                  </div>
                  <div className="config-item" style={{ gridColumn: "1 / -1" }}>
                    <div className="label">Detected motors</div>
                    <div className="value">
                      {preview.motorLabels.length > 0 ? preview.motorLabels.join(", ") : "None detected"}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="subtle" style={{ fontSize: "0.83rem" }}>
                  Couldn't read metadata from this file locally -- it will still be validated when analyzed.
                </p>
              )}
            </div>
          </div>

          <div className="step">
            <div className={`step-marker${stage === "analyzing" || stage === "error" ? " active" : ""}`}>3</div>
            <div className="step-body">
              <div className="step-title">Step 3</div>
              <div className="step-heading">Analyze</div>
              {error && <div className="notice error">{error}</div>}
              <button type="button" className="btn primary" disabled={stage === "select" || stage === "analyzing"} onClick={runAnalysis}>
                {stage === "analyzing" && <span className="spinner" />}
                {stage === "analyzing" ? "Analyzing…" : "Run Analysis"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
