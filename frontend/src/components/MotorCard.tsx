import type { MotorFinding, MotorSummary } from "../types";
import { estimateVelocityRpm, motorFindingStatus, STATUS_LABEL } from "../health";
import { Num } from "./Num";

const POSITION_NAME: Record<string, string> = {
  FL: "Front Left",
  FR: "Front Right",
  BL: "Back Left",
  BR: "Back Right",
};

export function MotorCard({
  summary,
  finding,
  commandedRpm,
}: {
  summary: MotorSummary;
  finding: MotorFinding | undefined;
  commandedRpm: number | null;
}) {
  const status = finding ? motorFindingStatus(finding.classification) : "healthy";
  const velocity = estimateVelocityRpm(summary, commandedRpm);
  const currentAmps = summary.current_mean !== null ? summary.current_mean / 1000 : null;

  return (
    <div className={`motor-card ${status}`}>
      <div className="motor-card-label">
        <span>{POSITION_NAME[summary.label] ?? summary.label}</span>
      </div>
      <div className="motor-card-metrics">
        <div className="motor-metric">
          <div className="value">
            <Num value={velocity} digits={0} unit="RPM" />
          </div>
          <div className="label">Velocity</div>
        </div>
        <div className="motor-metric">
          <div className="value">
            <Num value={currentAmps} digits={2} unit="A" />
          </div>
          <div className="label">Current</div>
        </div>
        <div className="motor-metric">
          <div className="value">
            <Num value={summary.temp_max_c} digits={0} unit="°C" />
          </div>
          <div className="label">Temperature</div>
        </div>
        <div className="motor-metric">
          <div className="value" style={{ fontSize: "0.82rem" }}>
            {finding ? STATUS_LABEL[status] : "Healthy"}
          </div>
          <div className="label">Resistance</div>
        </div>
      </div>
    </div>
  );
}
