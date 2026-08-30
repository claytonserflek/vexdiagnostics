import { useEffect, useState } from "react";
import { getTelemetry, getTest } from "../api";
import type { TelemetrySeries, TestDetailResponse } from "../types";
import { StatusBadge } from "./StatusBadge";
import { DrivetrainDiagram } from "./DrivetrainDiagram";
import { SideComparisonPanel } from "./SideComparisonPanel";
import { MotorFindingsTable } from "./MotorFindingsTable";
import { TelemetryCharts } from "./TelemetryCharts";
import { formatTestDate } from "../dateFormat";

export function TestDetail({
  testId,
  onBack,
  onCompare,
}: {
  testId: number;
  onBack: () => void;
  onCompare: (id: number) => void;
}) {
  const [detail, setDetail] = useState<TestDetailResponse | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySeries | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setTelemetry(null);
    setError(null);
    getTest(testId).then(setDetail).catch((e) => setError(String(e)));
    getTelemetry(testId).then(setTelemetry).catch((e) => setError(String(e)));
  }, [testId]);

  if (error) {
    return <div className="notice error">{error}</div>;
  }
  if (!detail) {
    return <p className="muted">Loading...</p>;
  }

  const { test, diagnostics } = detail;

  return (
    <div>
      <button className="back-link" onClick={onBack} type="button">
        ← Back to history
      </button>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: "0 0 4px" }}>{test.name}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {test.robot_name ?? "Unnamed robot"} · {formatTestDate(test.recorded_at, test.imported_at)}
              {test.commanded_cruise_rpm ? ` · ${test.commanded_cruise_rpm} RPM cruise` : ""}
              {test.trial_count ? ` · ${test.trial_count} trials` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <StatusBadge classification={diagnostics.overall_classification} />
            <button className="btn" onClick={() => onCompare(testId)} type="button">
              Compare with...
            </button>
          </div>
        </div>
        {test.notes && (
          <p style={{ marginTop: 12, fontSize: "0.88rem" }}>
            <strong>Notes:</strong> {test.notes}
          </p>
        )}
        <div className="notice info" style={{ marginTop: 12, marginBottom: 0 }}>
          {diagnostics.overall_summary}
        </div>
      </div>

      <DrivetrainDiagram summaries={diagnostics.motor_summaries} findings={diagnostics.motor_findings} />
      <SideComparisonPanel comparisons={diagnostics.side_comparisons} />
      <MotorFindingsTable summaries={diagnostics.motor_summaries} findings={diagnostics.motor_findings} />
      {telemetry && <TelemetryCharts series={telemetry} />}
    </div>
  );
}
