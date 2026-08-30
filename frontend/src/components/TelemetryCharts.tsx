import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TelemetrySeries } from "../types";

const COLORS = ["#2563eb", "#d1373f", "#1a9f5a", "#b7791f", "#7c3aed", "#0891b2"];

type ChartRow = Record<string, number | null>;

function buildTrialData(
  series: TelemetrySeries,
  trial: number,
  valueKey: "actual_velocity_rpm" | "current_ma",
): ChartRow[] {
  const byTimestamp = new Map<number, ChartRow>();
  for (const [label, points] of Object.entries(series)) {
    for (const p of points) {
      if (p.trial !== trial) continue;
      const row = byTimestamp.get(p.timestamp_ms) ?? { timestamp_ms: p.timestamp_ms };
      row[label] = p[valueKey];
      if (valueKey === "actual_velocity_rpm" && row["commanded"] === undefined) {
        row["commanded"] = p.commanded_velocity_rpm;
      }
      byTimestamp.set(p.timestamp_ms, row);
    }
  }
  return Array.from(byTimestamp.values()).sort((a, b) => (a.timestamp_ms as number) - (b.timestamp_ms as number));
}

export function TelemetryCharts({ series }: { series: TelemetrySeries }) {
  const motorLabels = Object.keys(series);
  const trials = useMemo(() => {
    const set = new Set<number>();
    for (const points of Object.values(series)) {
      for (const p of points) set.add(p.trial);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [series]);
  const [trial, setTrial] = useState(trials[0] ?? 1);

  const velocityData = useMemo(() => buildTrialData(series, trial, "actual_velocity_rpm"), [series, trial]);
  const currentData = useMemo(() => buildTrialData(series, trial, "current_ma"), [series, trial]);

  if (motorLabels.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <h3 className="card-title">Telemetry over time</h3>
      <div className="trial-tabs">
        {trials.map((t) => (
          <button
            key={t}
            className={`trial-tab${t === trial ? " active" : ""}`}
            onClick={() => setTrial(t)}
            type="button"
          >
            Trial {t}
          </button>
        ))}
      </div>

      <p className="muted" style={{ fontSize: "0.82rem", marginBottom: 4 }}>
        Velocity (RPM) — commanded (dashed) vs. actual, per motor
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={velocityData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" />
          <XAxis dataKey="timestamp_ms" tickFormatter={(v) => `${v}ms`} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="commanded"
            stroke="#94a3b8"
            strokeDasharray="4 3"
            dot={false}
            name="Commanded"
          />
          {motorLabels.map((label, i) => (
            <Line
              key={label}
              isAnimationActive={false}
              type="monotone"
              dataKey={label}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
              name={label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="muted" style={{ fontSize: "0.82rem", margin: "16px 0 4px" }}>
        Current draw (mA), per motor
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={currentData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e6ec" />
          <XAxis dataKey="timestamp_ms" tickFormatter={(v) => `${v}ms`} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          {motorLabels.map((label, i) => (
            <Line
              key={label}
              isAnimationActive={false}
              type="monotone"
              dataKey={label}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
              name={label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
