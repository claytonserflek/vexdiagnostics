import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compareTests, getTelemetry } from "../api";
import type { CompareResponse, TelemetrySeries, TestListItem } from "../types";
import { computeSideResistanceScore, sideAverages } from "../health";
import { Num } from "../components/Num";
import { EmptyState } from "../components/EmptyState";
import { SkeletonPanel } from "../components/Skeleton";

const COLORS = ["#2f6fed", "#c62f3a", "#16824f", "#92660a", "#7c5cd9", "#0891b2"];

/** Percentage-change pill for the headline resistance-score transition
 * (lower score is always better, so a negative % change is "improved"). */
function ScorePctPill({ before, after }: { before: number; after: number }) {
  if (before === 0) return null;
  const pct = ((after - before) / before) * 100;
  const flat = Math.abs(pct) < 1;
  const cls = flat ? "flat" : pct < 0 ? "improved" : "worse";
  const arrow = flat ? "→" : pct < 0 ? "↓" : "↑";
  return (
    <span className={`delta-pill ${cls}`}>
      {arrow} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

/** Raw signed delta with a unit, for the per-motor table -- avoids
 * pretending every delta is a clean ratio (a point-change like velocity
 * deficit isn't one). */
function ChangeBadge({ delta, unit, lowerIsBetter }: { delta: number; unit: string; lowerIsBetter: boolean }) {
  const flat = Math.abs(delta) < 0.5;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const cls = flat ? "flat" : improved ? "improved" : "worse";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`delta-pill ${cls}`}>
      {sign}
      {delta.toFixed(1)}
      {unit}
    </span>
  );
}

type OverlayMetric = "actual_velocity_rpm" | "current_ma";

function buildOverlayRows(
  before: TelemetrySeries,
  after: TelemetrySeries,
  commonLabels: string[],
  metric: OverlayMetric,
) {
  const byTimestamp = new Map<number, Record<string, number | null>>();
  for (const label of commonLabels) {
    for (const p of before[label] ?? []) {
      if (p.trial !== 1) continue;
      const row = byTimestamp.get(p.timestamp_ms) ?? { timestamp_ms: p.timestamp_ms };
      row[`${label} before`] = metric === "current_ma" ? (p.current_ma !== null ? p.current_ma / 1000 : null) : p[metric];
      byTimestamp.set(p.timestamp_ms, row);
    }
    for (const p of after[label] ?? []) {
      if (p.trial !== 1) continue;
      const row = byTimestamp.get(p.timestamp_ms) ?? { timestamp_ms: p.timestamp_ms };
      row[`${label} after`] = metric === "current_ma" ? (p.current_ma !== null ? p.current_ma / 1000 : null) : p[metric];
      byTimestamp.set(p.timestamp_ms, row);
    }
  }
  return Array.from(byTimestamp.values()).sort((a, b) => (a.timestamp_ms as number) - (b.timestamp_ms as number));
}

/** Oldest-first ordering (by recorded time, falling back to import time,
 * then id) -- used only to pick a sensible default "before"/"after" pair
 * when the user hasn't chosen one, since `tests` itself is sorted
 * newest-first for the history view. */
function chronological(tests: TestListItem[]): TestListItem[] {
  return [...tests].sort((a, b) => {
    const ta = a.recorded_at ?? a.imported_at ?? "";
    const tb = b.recorded_at ?? b.imported_at ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id - b.id;
  });
}

export function CompareTestsPage({
  tests,
  initialBeforeId,
}: {
  tests: TestListItem[];
  initialBeforeId?: number;
}) {
  const ordered = chronological(tests);
  const [beforeId, setBeforeId] = useState<number | null>(
    initialBeforeId ?? ordered[ordered.length - 2]?.id ?? ordered[0]?.id ?? null,
  );
  const [afterId, setAfterId] = useState<number | null>(() => {
    if (initialBeforeId !== undefined) {
      return tests.find((t) => t.id !== initialBeforeId)?.id ?? null;
    }
    return ordered[ordered.length - 1]?.id ?? null;
  });
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [telemetryBefore, setTelemetryBefore] = useState<TelemetrySeries | null>(null);
  const [telemetryAfter, setTelemetryAfter] = useState<TelemetrySeries | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (beforeId === null || afterId === null || beforeId === afterId) {
      setResult(null);
      return;
    }
    setResult(null);
    setTelemetryBefore(null);
    setTelemetryAfter(null);
    setError(null);
    compareTests(beforeId, afterId).then(setResult).catch((e) => setError(String(e)));
    getTelemetry(beforeId).then(setTelemetryBefore).catch(() => setTelemetryBefore(null));
    getTelemetry(afterId).then(setTelemetryAfter).catch(() => setTelemetryAfter(null));
  }, [beforeId, afterId]);

  const commonLabels = useMemo(() => {
    if (!telemetryBefore || !telemetryAfter) return [];
    return Object.keys(telemetryBefore).filter((l) => l in telemetryAfter);
  }, [telemetryBefore, telemetryAfter]);

  if (tests.length < 2) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Compare Tests</h1>
          <p className="page-subtitle">Run two tests around a mechanical change to see whether it helped.</p>
        </div>
        <div className="panel">
          <EmptyState
            title="Need at least two tests"
            hint="Import a baseline test, make a change to the robot, then import a second test to compare."
          />
        </div>
      </>
    );
  }

  const focusSide = result?.before.diagnostics.worse_side ?? result?.after.diagnostics.worse_side ?? null;
  const beforeScore = focusSide ? computeSideResistanceScore(focusSide, result!.before.diagnostics) : null;
  const afterScore = focusSide ? computeSideResistanceScore(focusSide, result!.after.diagnostics) : null;
  const beforeAvgs = focusSide ? sideAverages(focusSide, result!.before.diagnostics) : null;
  const afterAvgs = focusSide ? sideAverages(focusSide, result!.after.diagnostics) : null;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Compare Tests</h1>
        <p className="page-subtitle">Run two tests around a mechanical change to see whether it helped.</p>
      </div>

      <div className="panel">
        <div className="compare-picker">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Test A — Before</label>
            <select className="select" value={beforeId ?? ""} onChange={(e) => setBeforeId(Number(e.target.value))}>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <span className="compare-vs">vs.</span>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Test B — After</label>
            <select className="select" value={afterId ?? ""} onChange={(e) => setAfterId(Number(e.target.value))}>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {beforeId === afterId && (
        <div className="notice warning">Choose two different tests to compare.</div>
      )}
      {error && <div className="notice error">{error}</div>}

      {!result && beforeId !== afterId && beforeId !== null && afterId !== null && <SkeletonPanel lines={4} />}

      {result && (
        <>
          {result.comparison.warnings.map((w, i) => (
            <div className="notice warning" key={i}>
              {w}
            </div>
          ))}

          {focusSide && beforeScore !== null && afterScore !== null && beforeAvgs && afterAvgs && (
            <div className="panel">
              <h3 className="panel-title">
                {focusSide === "L" ? "Left" : "Right"} Drivetrain Resistance Score
              </h3>
              <div className="score-transition" style={{ margin: "10px 0" }}>
                <span>{beforeScore}</span>
                <span className="arrow">→</span>
                <span>{afterScore}</span>
                <ScorePctPill before={beforeScore} after={afterScore} />
              </div>
              <div className="stat-row">
                <div className="stat">
                  <div className="value" style={{ fontSize: "1rem" }}>
                    <Num value={beforeAvgs.avgVelocity} digits={0} unit="RPM" /> →{" "}
                    <Num value={afterAvgs.avgVelocity} digits={0} unit="RPM" />
                  </div>
                  <div className="label">Velocity</div>
                </div>
                <div className="stat">
                  <div className="value" style={{ fontSize: "1rem" }}>
                    <Num value={beforeAvgs.avgCurrentA} digits={2} unit="A" /> →{" "}
                    <Num value={afterAvgs.avgCurrentA} digits={2} unit="A" />
                  </div>
                  <div className="label">Current</div>
                </div>
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 14, marginBottom: 0 }}>
                {result.comparison.summary}
              </p>
            </div>
          )}

          <div className="panel">
            <h3 className="panel-title">Per-Motor Change</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Motor</th>
                    <th>Velocity deficit</th>
                    <th>Change</th>
                    <th>Current</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparison.motor_comparisons.map((m) => (
                    <tr key={m.label}>
                      <td>
                        <strong>{m.label}</strong>
                      </td>
                      <td className="mono">
                        {m.velocity_deficit_before?.toFixed(1) ?? "—"}% → {m.velocity_deficit_after?.toFixed(1) ?? "—"}%
                      </td>
                      <td>
                        {m.velocity_deficit_change_pts !== null && (
                          <ChangeBadge delta={m.velocity_deficit_change_pts} unit=" pts" lowerIsBetter />
                        )}
                      </td>
                      <td className="mono">
                        {m.current_before !== null ? (m.current_before / 1000).toFixed(2) : "—"} A →{" "}
                        {m.current_after !== null ? (m.current_after / 1000).toFixed(2) : "—"} A
                      </td>
                      <td>{m.current_change_pct !== null && <ChangeBadge delta={m.current_change_pct} unit="%" lowerIsBetter />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {commonLabels.length > 0 && telemetryBefore && telemetryAfter && (
            <OverlayCharts before={telemetryBefore} after={telemetryAfter} commonLabels={commonLabels} />
          )}
        </>
      )}
    </>
  );
}

function OverlayCharts({
  before,
  after,
  commonLabels,
}: {
  before: TelemetrySeries;
  after: TelemetrySeries;
  commonLabels: string[];
}) {
  const velocityRows = useMemo(() => buildOverlayRows(before, after, commonLabels, "actual_velocity_rpm"), [before, after, commonLabels]);
  const currentRows = useMemo(() => buildOverlayRows(before, after, commonLabels, "current_ma"), [before, after, commonLabels]);
  const colorByLabel = new Map(commonLabels.map((l, i) => [l, COLORS[i % COLORS.length]]));

  function renderChart(rows: Record<string, number | null>[], unit: string) {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="timestamp_ms"
            tickFormatter={(v) => `${(v / 1000).toFixed(1)}s`}
            fontSize={11}
            stroke="var(--text-tertiary)"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis fontSize={11} stroke="var(--text-tertiary)" tickLine={false} axisLine={false} width={44} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
            labelFormatter={(v) => `t = ${(Number(v) / 1000).toFixed(2)}s`}
            formatter={(value, name) => [`${Number(value).toFixed(2)} ${unit}`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {commonLabels.map((label) => (
            <Line
              key={`${label}-before`}
              isAnimationActive={false}
              type="monotone"
              dataKey={`${label} before`}
              stroke={colorByLabel.get(label)}
              strokeDasharray="4 3"
              strokeWidth={1.25}
              dot={false}
              name={`${label} before`}
            />
          ))}
          {commonLabels.map((label) => (
            <Line
              key={`${label}-after`}
              isAnimationActive={false}
              type="monotone"
              dataKey={`${label} after`}
              stroke={colorByLabel.get(label)}
              strokeWidth={1.75}
              dot={false}
              name={`${label} after`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Telemetry Overlay</h3>
          <p className="panel-hint" style={{ marginBottom: 0 }}>
            Trial 1 of each test. Dashed = before, solid = after.
          </p>
        </div>
      </div>
      <p className="chart-caption">Velocity vs. Time (RPM)</p>
      {renderChart(velocityRows, "RPM")}
      <p className="chart-caption section-gap">Current vs. Time (A)</p>
      {renderChart(currentRows, "A")}
    </div>
  );
}
