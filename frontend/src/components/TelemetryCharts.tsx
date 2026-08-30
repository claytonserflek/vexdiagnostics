import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TelemetrySeries } from "../types";

const COLORS = ["#2f6fed", "#c62f3a", "#16824f", "#92660a", "#7c5cd9", "#0891b2"];

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
      row[label] = valueKey === "current_ma" && p.current_ma !== null ? p.current_ma / 1000 : p[valueKey];
      if (valueKey === "actual_velocity_rpm" && row["commanded"] === undefined) {
        row["commanded"] = p.commanded_velocity_rpm;
      }
      byTimestamp.set(p.timestamp_ms, row);
    }
  }
  return Array.from(byTimestamp.values()).sort((a, b) => (a.timestamp_ms as number) - (b.timestamp_ms as number));
}

function Chart({
  title,
  data,
  motorLabels,
  colorByLabel,
  visible,
  unit,
  showCommanded,
}: {
  title: string;
  data: ChartRow[];
  motorLabels: string[];
  colorByLabel: Map<string, string>;
  visible: Set<string>;
  unit: string;
  showCommanded?: boolean;
}) {
  return (
    <div className="section-gap">
      <p className="chart-caption">{title}</p>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="timestamp_ms"
            tickFormatter={(v) => `${(v / 1000).toFixed(1)}s`}
            fontSize={11}
            stroke="var(--text-tertiary)"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            fontSize={11}
            stroke="var(--text-tertiary)"
            tickLine={false}
            axisLine={false}
            width={44}
            label={{ value: unit, angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--text-tertiary)" }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            labelFormatter={(v) => `t = ${(Number(v) / 1000).toFixed(2)}s`}
            formatter={(value, name) => [`${Number(value).toFixed(2)} ${unit}`, name]}
          />
          {showCommanded && (
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="commanded"
              stroke="var(--text-tertiary)"
              strokeDasharray="3 3"
              strokeWidth={1.25}
              dot={false}
              name="Commanded"
            />
          )}
          {motorLabels
            .filter((label) => visible.has(label))
            .map((label) => (
              <Line
                key={label}
                isAnimationActive={false}
                type="monotone"
                dataKey={label}
                stroke={colorByLabel.get(label)}
                dot={false}
                strokeWidth={1.5}
                name={label}
              />
            ))}
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TelemetryCharts({ series }: { series: TelemetrySeries }) {
  const motorLabels = useMemo(() => Object.keys(series), [series]);
  const colorByLabel = useMemo(
    () => new Map(motorLabels.map((label, i) => [label, COLORS[i % COLORS.length]])),
    [motorLabels],
  );
  const trials = useMemo(() => {
    const set = new Set<number>();
    for (const points of Object.values(series)) {
      for (const p of points) set.add(p.trial);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [series]);
  const [trial, setTrial] = useState(trials[0] ?? 1);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(motorLabels));

  const velocityData = useMemo(() => buildTrialData(series, trial, "actual_velocity_rpm"), [series, trial]);
  const currentData = useMemo(() => buildTrialData(series, trial, "current_ma"), [series, trial]);
  const hasCommandedData = useMemo(
    () => Object.values(series).some((points) => points.some((p) => p.commanded_velocity_rpm !== null)),
    [series],
  );

  if (motorLabels.length === 0) {
    return null;
  }

  function toggle(label: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h3 className="panel-title">Telemetry</h3>
          <p className="panel-hint" style={{ marginBottom: 0 }}>
            Velocity and current over time, per trial. Toggle motors below.
          </p>
        </div>
        <div className="chip-row" style={{ marginBottom: 0 }}>
          {trials.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${t === trial ? " active-accent" : ""}`}
              onClick={() => setTrial(t)}
            >
              Trial {t}
            </button>
          ))}
        </div>
      </div>

      <div className="chip-row">
        {motorLabels.map((label) => (
          <button
            key={label}
            type="button"
            className="chip"
            data-active={visible.has(label)}
            onClick={() => toggle(label)}
            aria-pressed={visible.has(label)}
          >
            <span className="chip-dot" style={{ background: colorByLabel.get(label) }} />
            {label}
          </button>
        ))}
      </div>

      <Chart
        title="Velocity vs. Time (RPM)"
        data={velocityData}
        motorLabels={motorLabels}
        colorByLabel={colorByLabel}
        visible={visible}
        unit="RPM"
        showCommanded={hasCommandedData}
      />
      <Chart
        title="Current vs. Time (A)"
        data={currentData}
        motorLabels={motorLabels}
        colorByLabel={colorByLabel}
        visible={visible}
        unit="A"
      />
    </div>
  );
}
