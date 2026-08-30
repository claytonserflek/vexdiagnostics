import { useEffect, useState } from "react";
import { getTelemetry, getTest } from "../api";
import type { TelemetrySeries, TestDetailResponse } from "../types";
import {
  abnormalityDescription,
  computeSideResistanceScore,
  INSPECT_AREAS,
  overallStatus,
  resistanceScoreStatus,
  resultHeadline,
  sideAverages,
} from "../health";
import { StatusPill } from "../components/StatusBadge";
import { Num } from "../components/Num";
import { TelemetryCharts } from "../components/TelemetryCharts";
import { SkeletonPanel } from "../components/Skeleton";
import { IconWarning } from "../components/Icons";
import { formatTestDate } from "../dateFormat";

function SideCard({
  side,
  label,
  detail,
}: {
  side: "L" | "R";
  label: string;
  detail: TestDetailResponse;
}) {
  const { test, diagnostics } = detail;
  const { avgCurrentA, avgVelocity, motorCount } = sideAverages(side, diagnostics, test.commanded_cruise_rpm);
  const score = computeSideResistanceScore(side, diagnostics);
  const status = score !== null ? resistanceScoreStatus(score) : null;

  if (motorCount === 0) {
    return null;
  }

  return (
    <div className="side-compare-card">
      <div className="side-name">
        <span>{label}</span>
        {status && (status === "inspect" || status === "critical") && (
          <span className="flex-row" style={{ color: "var(--status-inspect)", gap: 4 }}>
            <IconWarning />
            <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>Inspect</span>
          </span>
        )}
      </div>
      <div className="side-compare-row">
        <span className="muted">Current</span>
        <span className="value">
          <Num value={avgCurrentA} digits={2} unit="A" />
        </span>
      </div>
      <div className="side-compare-row">
        <span className="muted">Velocity</span>
        <span className="value">
          <Num value={avgVelocity} digits={0} unit="RPM" />
        </span>
      </div>
      <div className="side-compare-row">
        <span className="muted">Resistance Score</span>
        <span className="value">{score ?? "—"}</span>
      </div>
    </div>
  );
}

export function DiagnosticResultsPage({
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
    return (
      <>
        <SkeletonPanel lines={2} />
        <SkeletonPanel lines={3} />
      </>
    );
  }

  const { test, diagnostics } = detail;
  const flaggedMotors = diagnostics.motor_findings.filter((f) => f.classification !== "Normal");

  return (
    <>
      <button type="button" className="back-link" onClick={onBack}>
        ← Back
      </button>

      <div className="panel">
        <div className="result-banner">
          <div>
            <div className="page-eyebrow">Diagnostic Complete</div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>
              {test.name}
            </h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>
              {test.robot_name ?? "Unnamed robot"} &middot; {formatTestDate(test.recorded_at, test.imported_at)}
              {test.commanded_cruise_rpm ? ` · ${test.commanded_cruise_rpm} RPM cruise` : ""}
              {test.trial_count ? ` · ${test.trial_count} trials` : ""}
            </p>
          </div>
          <div className="flex-row">
            <StatusPill status={overallStatus(diagnostics)} />
            <button type="button" className="btn" onClick={() => onCompare(testId)}>
              Compare
            </button>
          </div>
        </div>
        <p className="result-headline">{resultHeadline(diagnostics)}</p>
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>
          {diagnostics.overall_summary}
        </p>
        {test.notes && (
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 10 }}>
            <strong style={{ color: "var(--text)" }}>Notes:</strong> {test.notes}
          </p>
        )}
      </div>

      <div className="side-compare-grid section-gap">
        <SideCard side="L" label="Left Drivetrain" detail={detail} />
        <SideCard side="R" label="Right Drivetrain" detail={detail} />
      </div>

      {telemetry && (
        <div className="section-gap">
          <TelemetryCharts series={telemetry} />
        </div>
      )}

      <div className="panel section-gap">
        <h3 className="panel-title">Detected Abnormalities</h3>
        {flaggedMotors.length === 0 ? (
          <p className="panel-hint" style={{ marginBottom: 0 }}>
            No motor showed a resistance or binding signature large enough to flag in this test.
          </p>
        ) : (
          flaggedMotors.map((f) => (
            <div className="abnormality-item" key={f.label}>
              <h4>{f.label} Motor</h4>
              <p>{abnormalityDescription(f)}</p>
              {f.notes.length > 0 && (
                <p style={{ marginTop: -4 }}>{f.notes.join(" ")}</p>
              )}
              <p className="subtle" style={{ fontSize: "0.76rem", marginBottom: 4 }}>
                Possible areas to inspect:
              </p>
              <ul>
                {INSPECT_AREAS.map((area) => (
                  <li key={area}>{area}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}
