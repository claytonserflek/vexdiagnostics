import { Fragment } from "react";
import type { MotorFinding, MotorSummary } from "../types";
import { classificationBgVar, classificationColorVar } from "./StatusBadge";

function fmt(value: number | null, digits = 1, suffix = ""): string {
  return value === null ? "—" : `${value.toFixed(digits)}${suffix}`;
}

function MotorBox({ summary, finding }: { summary: MotorSummary; finding: MotorFinding | undefined }) {
  const classification = finding?.classification ?? "Normal";
  return (
    <div
      className="drivetrain-box"
      style={{
        borderColor: classificationColorVar(classification),
        background: classificationBgVar(classification),
      }}
      title={finding?.notes.join(" ") || undefined}
    >
      <div className="label">{summary.label}</div>
      <div className="status" style={{ color: classificationColorVar(classification) }}>
        {classification}
      </div>
      <div className="metrics">
        Velocity deficit: {fmt(summary.velocity_deficit_mean, 1, " pts")}
        <br />
        Current: {fmt(summary.current_mean, 0, " mA")}
      </div>
    </div>
  );
}

export function DrivetrainDiagram({
  summaries,
  findings,
}: {
  summaries: MotorSummary[];
  findings: MotorFinding[];
}) {
  const findingByLabel = new Map(findings.map((f) => [f.label, f]));
  const left = summaries.filter((s) => s.side === "L");
  const right = summaries.filter((s) => s.side === "R");
  const other = summaries.filter((s) => s.side === null);

  if (left.length === 0 && right.length === 0) {
    return (
      <div className="card">
        <h3 className="card-title">Drivetrain resistance map</h3>
        <p className="muted">
          Motor labels in this test weren't recognized as left/right, so only the individual motor list is
          shown below.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {summaries.map((s) => (
            <MotorBox key={s.label} summary={s} finding={findingByLabel.get(s.label)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="card-title">Drivetrain resistance map</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.82rem" }}>
        Estimated from velocity and current telemetry, not a direct friction measurement. See the findings
        below for the statistical basis.
      </p>
      <div className="drivetrain-grid">
        <div className="side-label">Left</div>
        <div className="side-label">Right</div>
        {Array.from({ length: Math.max(left.length, right.length) }).map((_, i) => (
          <Fragment key={i}>
            {left[i] ? (
              <MotorBox summary={left[i]} finding={findingByLabel.get(left[i].label)} />
            ) : (
              <div />
            )}
            {right[i] ? (
              <MotorBox summary={right[i]} finding={findingByLabel.get(right[i].label)} />
            ) : (
              <div />
            )}
          </Fragment>
        ))}
      </div>
      {other.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="side-label">Other</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {other.map((s) => (
              <MotorBox key={s.label} summary={s} finding={findingByLabel.get(s.label)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
