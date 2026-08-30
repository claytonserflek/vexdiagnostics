import type { MotorClassification } from "../types";
import { motorFindingStatus, STATUS_LABEL, type StatusTier } from "../health";

export function StatusPill({ status, label }: { status: StatusTier | "unknown"; label?: string }) {
  const className = status === "unknown" ? "neutral" : status;
  const text = label ?? (status === "unknown" ? "No data" : STATUS_LABEL[status]);
  return <span className={`badge ${className}`}>{text}</span>;
}

export function MotorStatusBadge({ classification }: { classification: MotorClassification }) {
  const tier = motorFindingStatus(classification);
  return <span className={`badge ${tier}`}>{classification}</span>;
}
