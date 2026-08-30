import type { SideComparison } from "../types";

const METRIC_LABELS: Record<string, string> = {
  velocity_deficit_pct: "Velocity deficit",
  steady_current_ma: "Steady-state current",
};

const METRIC_UNITS: Record<string, string> = {
  velocity_deficit_pct: "pts",
  steady_current_ma: "mA",
};

function significanceLabel(sig: string, p: number | null): string {
  if (sig === "strong") return `Strong evidence (p = ${p?.toFixed(3)})`;
  if (sig === "weak") return `Weak evidence (p = ${p?.toFixed(3)})`;
  return p === null ? "No test available" : `No significant difference (p = ${p.toFixed(3)})`;
}

export function SideComparisonPanel({ comparisons }: { comparisons: SideComparison[] }) {
  if (comparisons.length === 0) {
    return (
      <div className="card">
        <h3 className="card-title">Left vs. right comparison</h3>
        <p className="muted">
          Not enough recognized left/right motor labels in this test to run a side-level comparison.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="card-title">Left vs. right comparison</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.82rem" }}>
        Paired t-test across trials/phases (see docs/diagnostics-algorithm.md). n=6 samples is small --
        weak evidence (p &lt; 0.10) is reported as such, not overstated.
      </p>
      <div className="stat-row">
        {comparisons.map((c) => (
          <div className="stat" key={c.metric}>
            <div className="value">
              {c.mean_diff > 0 ? "Right +" : "Left +"}
              {Math.abs(c.mean_diff).toFixed(1)} {METRIC_UNITS[c.metric]}
            </div>
            <div className="label">
              {METRIC_LABELS[c.metric]} · {significanceLabel(c.significance, c.p_value)}
            </div>
            {!c.practical_threshold_met && (
              <div className="label" style={{ marginTop: 2 }}>
                Below practical-significance threshold
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
