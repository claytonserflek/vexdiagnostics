import { useMemo, useState } from "react";
import type { MotorFinding, MotorSummary } from "../types";
import {
  inferSlot,
  motorFindingStatus,
  statusColorVar,
  STATUS_LABEL,
  worstMotorFinding,
  type Slot,
} from "../health";
import { Num } from "./Num";

const SLOT_POSITION: Record<Slot, { x: number; y: number }> = {
  FL: { x: 34, y: 46 },
  FR: { x: 186, y: 46 },
  BL: { x: 34, y: 214 },
  BR: { x: 186, y: 214 },
};

const WHEEL_W = 26;
const WHEEL_H = 64;

export function DrivetrainDiagram({
  summaries,
  findings,
}: {
  summaries: MotorSummary[];
  findings: MotorFinding[];
}) {
  const findingByLabel = useMemo(() => new Map(findings.map((f) => [f.label, f])), [findings]);
  const placed = useMemo(() => {
    const map = new Map<Slot, MotorSummary>();
    for (const s of summaries) {
      const slot = inferSlot(s);
      if (slot) map.set(slot, s);
    }
    return map;
  }, [summaries]);
  const unplaced = summaries.filter((s) => !inferSlot(s));

  const defaultLabel = worstMotorFinding(findings)?.label ?? summaries[0]?.label ?? null;
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const activeLabel = hovered ?? pinned ?? defaultLabel;
  const activeSummary = summaries.find((s) => s.label === activeLabel) ?? null;
  const activeFinding = activeLabel ? findingByLabel.get(activeLabel) : undefined;

  if (placed.size === 0) {
    return (
      <p className="subtle" style={{ fontSize: "0.85rem" }}>
        Motor labels in this test weren't recognized as front/back + left/right positions, so a positional
        diagram can't be drawn. See the motor cards above for per-motor detail.
      </p>
    );
  }

  return (
    <div className="drivetrain-diagram">
      <div className="drivetrain-svg-wrap">
        <svg width={246} height={260} viewBox="0 0 246 260" role="img" aria-label="Drivetrain layout">
          {/* chassis */}
          <rect x={70} y={40} width={106} height={180} rx={10} fill="var(--surface-sunken)" stroke="var(--border)" />
          {(["FL", "FR", "BL", "BR"] as Slot[]).map((slot) => {
            const pos = SLOT_POSITION[slot];
            const summary = placed.get(slot);
            if (!summary) return null;
            const finding = findingByLabel.get(summary.label);
            const status = finding ? motorFindingStatus(finding.classification) : "healthy";
            const isActive = summary.label === activeLabel;
            const shaftX1 = slot.endsWith("L") ? pos.x + WHEEL_W : pos.x;
            const shaftX2 = slot.endsWith("L") ? 70 : 176;
            return (
              <g key={slot}>
                <line x1={shaftX1} y1={pos.y + WHEEL_H / 2} x2={shaftX2} y2={pos.y + WHEEL_H / 2} stroke="var(--border-strong)" strokeWidth={2} />
                <rect
                  className="drivetrain-motor-shape"
                  x={pos.x}
                  y={pos.y}
                  width={WHEEL_W}
                  height={WHEEL_H}
                  rx={4}
                  fill={`var(--status-${status}-bg)`}
                  stroke={statusColorVar(status)}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  tabIndex={0}
                  role="button"
                  aria-label={`${summary.label}: ${finding ? STATUS_LABEL[status] : "Healthy"}`}
                  onMouseEnter={() => setHovered(summary.label)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(summary.label)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setPinned(summary.label)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPinned(summary.label);
                    }
                  }}
                />
                <text
                  x={pos.x + WHEEL_W / 2}
                  y={pos.y + WHEEL_H / 2 + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fontFamily="var(--font-mono)"
                  fill={statusColorVar(status)}
                  pointerEvents="none"
                >
                  {slot}
                </text>
              </g>
            );
          })}
          <text x={123} y={135} textAnchor="middle" fontSize={9} letterSpacing={1.5} fill="var(--text-tertiary)" pointerEvents="none">
            CHASSIS
          </text>
        </svg>
      </div>

      <div className="drivetrain-detail">
        {activeSummary ? (
          <>
            <div className="flex-row" style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: "0.92rem" }}>{activeSummary.label}</strong>
              <span className={`badge ${activeFinding ? motorFindingStatus(activeFinding.classification) : "healthy"}`}>
                {activeFinding ? STATUS_LABEL[motorFindingStatus(activeFinding.classification)] : "Healthy"}
              </span>
            </div>
            <div className="stat-row" style={{ gap: 20 }}>
              <div className="stat">
                <div className="value" style={{ fontSize: "1rem" }}>
                  <Num value={activeSummary.avg_velocity_rpm_mean} digits={0} unit="RPM" />
                </div>
                <div className="label">Velocity</div>
              </div>
              <div className="stat">
                <div className="value" style={{ fontSize: "1rem" }}>
                  <Num value={activeSummary.current_mean !== null ? activeSummary.current_mean / 1000 : null} digits={2} unit="A" />
                </div>
                <div className="label">Current</div>
              </div>
              <div className="stat">
                <div className="value" style={{ fontSize: "1rem" }}>
                  <Num value={activeSummary.temp_max_c} digits={0} unit="°C" />
                </div>
                <div className="label">Temperature</div>
              </div>
            </div>
            {activeFinding && activeFinding.notes.length > 0 && (
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
                {activeFinding.notes.join(" ")}
              </p>
            )}
          </>
        ) : (
          <p className="drivetrain-detail-empty">Hover or select a motor to see its telemetry.</p>
        )}
        {unplaced.length > 0 && (
          <p className="subtle" style={{ fontSize: "0.76rem", marginTop: 12 }}>
            Not shown in the diagram (unrecognized position): {unplaced.map((s) => s.label).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
