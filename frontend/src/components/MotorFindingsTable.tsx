import type { MotorFinding, MotorSummary } from "../types";
import { MotorStatusBadge } from "./StatusBadge";

function fmt(value: number | null, digits = 1, suffix = ""): string {
  return value === null ? "—" : `${value.toFixed(digits)}${suffix}`;
}

export function MotorFindingsTable({
  summaries,
  findings,
}: {
  summaries: MotorSummary[];
  findings: MotorFinding[];
}) {
  const summaryByLabel = new Map(summaries.map((s) => [s.label, s]));
  return (
    <div className="card">
      <h3 className="card-title">Per-motor findings</h3>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Motor</th>
              <th>Result</th>
              <th>Velocity deficit</th>
              <th>Current draw</th>
              <th>Gap vs. others</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => {
              const s = summaryByLabel.get(f.label);
              return (
                <tr key={f.label}>
                  <td>
                    <strong>{f.label}</strong>
                    {s?.side && <span className="muted"> ({s.side === "L" ? "left" : "right"})</span>}
                  </td>
                  <td>
                    <MotorStatusBadge classification={f.classification} />
                  </td>
                  <td>{fmt(s?.velocity_deficit_mean ?? null, 1, " %")}</td>
                  <td>{fmt(s?.current_mean ?? null, 0, " mA")}</td>
                  <td>
                    {f.velocity_gap_pts !== null && <div>{fmt(f.velocity_gap_pts, 1, " pts velocity")}</div>}
                    {f.current_gap_pct !== null && <div>{fmt(f.current_gap_pct, 0, "% current")}</div>}
                  </td>
                  <td className="muted" style={{ fontSize: "0.78rem", maxWidth: 240 }}>
                    {f.notes.join(" ") || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
