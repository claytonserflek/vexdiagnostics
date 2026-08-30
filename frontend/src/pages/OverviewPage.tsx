import { useEffect, useState } from "react";
import { getTest } from "../api";
import type { TestDetailResponse, TestListItem } from "../types";
import { computeHealthScore, orderMotorsForDisplay, scoreToStatus, statusColorVar, STATUS_LABEL } from "../health";
import { StatusPill } from "../components/StatusBadge";
import { MotorCard } from "../components/MotorCard";
import { DrivetrainDiagram } from "../components/DrivetrainDiagram";
import { EmptyState } from "../components/EmptyState";
import { SkeletonPanel } from "../components/Skeleton";
import { formatTestDate } from "../dateFormat";

export function OverviewPage({
  tests,
  onRunDiagnostic,
  onOpenTest,
}: {
  tests: TestListItem[];
  onRunDiagnostic: () => void;
  onOpenTest: (id: number) => void;
}) {
  const latest = tests[0] ?? null;
  const [detail, setDetail] = useState<TestDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!latest) return;
    setDetail(null);
    setError(null);
    getTest(latest.id)
      .then(setDetail)
      .catch((e) => setError(String(e)));
  }, [latest?.id]);

  if (!latest) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Robot Health</h1>
          <p className="page-subtitle">Latest drivetrain diagnostic</p>
        </div>
        <div className="panel">
          <EmptyState
            title="No diagnostic tests yet"
            hint="Run a standardized drivetrain test and import its telemetry CSV to see your robot's health here."
            action={
              <button type="button" className="btn primary" onClick={onRunDiagnostic}>
                Run Diagnostic
              </button>
            }
          />
        </div>
      </>
    );
  }

  if (error) {
    return <div className="notice error">{error}</div>;
  }

  if (!detail) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Robot Health</h1>
          <p className="page-subtitle">Latest drivetrain diagnostic</p>
        </div>
        <SkeletonPanel lines={2} />
        <SkeletonPanel lines={4} />
      </>
    );
  }

  const { test, diagnostics } = detail;
  const score = computeHealthScore(diagnostics);
  const status = score === null ? "unknown" : scoreToStatus(score);
  const orderedMotors = orderMotorsForDisplay(diagnostics.motor_summaries);
  const findingByLabel = new Map(diagnostics.motor_findings.map((f) => [f.label, f]));

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Robot Health</h1>
        <p className="page-subtitle">
          Latest drivetrain diagnostic &middot;{" "}
          <button type="button" className="back-link" style={{ display: "inline", margin: 0 }} onClick={() => onOpenTest(latest.id)}>
            {test.name}
          </button>{" "}
          &middot; {formatTestDate(test.recorded_at, test.imported_at)}
        </p>
      </div>

      <div className="panel">
        <div className="health-summary">
          <div>
            <span className="health-score" style={{ color: statusColorVar(status) }}>
              {score ?? "—"}
            </span>
            <span className="health-score-max">/100</span>
          </div>
          <div className="health-meta">
            <StatusPill status={status} />
            <div className="health-bar-track">
              <div
                className="health-bar-fill"
                style={{ width: `${score ?? 0}%`, background: statusColorVar(status) }}
              />
            </div>
            <span className="subtle" style={{ fontSize: "0.78rem" }}>
              {score === null
                ? "Not enough matching telemetry to score this test."
                : `Derived from ${STATUS_LABEL[scoreToStatus(score)].toLowerCase()} classification and per-motor findings.`}
            </span>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: "0.95rem", margin: "28px 0 12px" }}>Drivetrain Motors</h2>
      <div className="motor-grid">
        {orderedMotors.map((s) => (
          <MotorCard key={s.label} summary={s} finding={findingByLabel.get(s.label)} commandedRpm={test.commanded_cruise_rpm} />
        ))}
      </div>

      <div className="panel section-gap">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Drivetrain Layout</h3>
            <p className="panel-hint" style={{ marginBottom: 0 }}>
              Top-down view. Hover or select a motor for detail.
            </p>
          </div>
        </div>
        <DrivetrainDiagram
          summaries={diagnostics.motor_summaries}
          findings={diagnostics.motor_findings}
          commandedRpm={test.commanded_cruise_rpm}
        />
      </div>
    </>
  );
}
