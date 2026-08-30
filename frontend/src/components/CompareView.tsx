import { useEffect, useState } from "react";
import { compareTests } from "../api";
import type { CompareResponse, TestListItem } from "../types";

function fmt(value: number | null, digits = 1, suffix = ""): string {
  return value === null ? "—" : `${value.toFixed(digits)}${suffix}`;
}

function ChangeCell({ value, unit, invertGood }: { value: number | null; unit: string; invertGood?: boolean }) {
  if (value === null) return <span className="muted">—</span>;
  const improved = invertGood ? value < 0 : value > 0;
  const color = Math.abs(value) < 0.5 ? "var(--text-muted)" : improved ? "var(--normal)" : "var(--high)";
  const sign = value > 0 ? "+" : "";
  return (
    <span style={{ color, fontWeight: 600 }}>
      {sign}
      {value.toFixed(1)}
      {unit}
    </span>
  );
}

export function CompareView({
  beforeId,
  tests,
  onBack,
}: {
  beforeId: number;
  tests: TestListItem[];
  onBack: () => void;
}) {
  const otherTests = tests.filter((t) => t.id !== beforeId);
  const [afterId, setAfterId] = useState<number | null>(otherTests[0]?.id ?? null);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (afterId === null) return;
    setResult(null);
    setError(null);
    compareTests(beforeId, afterId)
      .then(setResult)
      .catch((e) => setError(String(e)));
  }, [beforeId, afterId]);

  return (
    <div>
      <button className="back-link" onClick={onBack} type="button">
        ← Back
      </button>

      <div className="card">
        <h3 className="card-title">Before / after comparison</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          Comparing against: <strong>{tests.find((t) => t.id === beforeId)?.name}</strong>
        </p>
        <label className="muted" style={{ fontSize: "0.85rem", marginRight: 8 }}>
          Compare with:
        </label>
        <select
          className="select-inline"
          value={afterId ?? ""}
          onChange={(e) => setAfterId(Number(e.target.value))}
        >
          {otherTests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="notice error">{error}</div>}

      {result && (
        <>
          {result.comparison.warnings.map((w, i) => (
            <div className="notice warning" key={i}>
              {w}
            </div>
          ))}

          <div className="card">
            <h3 className="card-title">Side asymmetry</h3>
            <div className="stat-row">
              <div className="stat">
                <div className="value">{fmt(result.comparison.side_asymmetry_before_pts, 1, " pts")}</div>
                <div className="label">Before</div>
              </div>
              <div className="stat">
                <div className="value">{fmt(result.comparison.side_asymmetry_after_pts, 1, " pts")}</div>
                <div className="label">After</div>
              </div>
              <div className="stat">
                <div className="value">
                  <ChangeCell value={result.comparison.side_asymmetry_change_pct} unit="%" invertGood />
                </div>
                <div className="label">Change</div>
              </div>
            </div>
            <p style={{ marginTop: 16, marginBottom: 0, fontSize: "0.9rem" }}>{result.comparison.summary}</p>
          </div>

          <div className="card">
            <h3 className="card-title">Per-motor change</h3>
            <table>
              <thead>
                <tr>
                  <th>Motor</th>
                  <th>Velocity deficit (before → after)</th>
                  <th>Change</th>
                  <th>Current (before → after)</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {result.comparison.motor_comparisons.map((m) => (
                  <tr key={m.label}>
                    <td>
                      <strong>{m.label}</strong>
                    </td>
                    <td>
                      {fmt(m.velocity_deficit_before, 1, "%")} → {fmt(m.velocity_deficit_after, 1, "%")}
                    </td>
                    <td>
                      <ChangeCell value={m.velocity_deficit_change_pts} unit=" pts" invertGood />
                    </td>
                    <td>
                      {fmt(m.current_before, 0, " mA")} → {fmt(m.current_after, 0, " mA")}
                    </td>
                    <td>
                      <ChangeCell value={m.current_change_pct} unit="%" invertGood />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
