import { useCallback, useEffect, useState } from "react";
import "./index.css";
import { listTests } from "./api";
import type { TestListItem } from "./types";
import { UploadPanel } from "./components/UploadPanel";
import { TestHistoryList } from "./components/TestHistoryList";
import { TestDetail } from "./components/TestDetail";
import { CompareView } from "./components/CompareView";

type View = { name: "upload" } | { name: "history" } | { name: "detail"; id: number } | { name: "compare"; id: number };

export default function App() {
  const [view, setView] = useState<View>({ name: "history" });
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshTests = useCallback(() => {
    listTests()
      .then(setTests)
      .catch((e) => setLoadError(String(e)));
  }, []);

  useEffect(() => {
    refreshTests();
  }, [refreshTests]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          VEX Diagnostics
          <span className="brand-sub">Drivetrain resistance mapping</span>
        </div>
        <button
          className={`nav-item${view.name === "history" ? " active" : ""}`}
          onClick={() => setView({ name: "history" })}
          type="button"
        >
          Test History
        </button>
        <button
          className={`nav-item${view.name === "upload" ? " active" : ""}`}
          onClick={() => setView({ name: "upload" })}
          type="button"
        >
          Import Test
        </button>
      </aside>

      <main className="main-content">
        {loadError && <div className="notice error">{loadError}</div>}

        {view.name === "upload" && (
          <>
            <h1 className="page-title">Import Test</h1>
            <p className="page-subtitle">
              Import a telemetry CSV exported from a standardized drivetrain diagnostic run.
            </p>
            <UploadPanel
              onImported={(result) => {
                refreshTests();
                setView({ name: "detail", id: result.test.id });
              }}
            />
          </>
        )}

        {view.name === "history" && (
          <>
            <h1 className="page-title">Test History</h1>
            <p className="page-subtitle">Every imported drivetrain diagnostic run for this robot.</p>
            <TestHistoryList tests={tests} onSelect={(id) => setView({ name: "detail", id })} />
          </>
        )}

        {view.name === "detail" && (
          <TestDetail
            testId={view.id}
            onBack={() => setView({ name: "history" })}
            onCompare={(id) => setView({ name: "compare", id })}
          />
        )}

        {view.name === "compare" && (
          <CompareView beforeId={view.id} tests={tests} onBack={() => setView({ name: "detail", id: view.id })} />
        )}
      </main>
    </div>
  );
}
