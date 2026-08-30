import type { OverallClassification } from "../types";

const LABELS: Record<OverallClassification, string> = {
  normal: "Normal",
  possible: "Possible Resistance",
  high: "High Resistance",
  insufficient_data: "Insufficient Data",
};

export function StatusBadge({ classification }: { classification: OverallClassification }) {
  return <span className={`badge ${classification}`}>{LABELS[classification]}</span>;
}

const MOTOR_CLASS_MAP: Record<string, OverallClassification> = {
  Normal: "normal",
  "Possible High Resistance": "possible",
  "Possible Mechanism Binding": "possible",
  "High Resistance": "high",
};

export function MotorStatusBadge({ classification }: { classification: string }) {
  const mapped = MOTOR_CLASS_MAP[classification] ?? "insufficient_data";
  return <span className={`badge ${mapped}`}>{classification}</span>;
}

export function classificationColorVar(classification: string): string {
  const mapped = MOTOR_CLASS_MAP[classification] ?? "insufficient_data";
  return `var(--${mapped === "insufficient_data" ? "unknown" : mapped})`;
}

export function classificationBgVar(classification: string): string {
  const mapped = MOTOR_CLASS_MAP[classification] ?? "insufficient_data";
  return `var(--${mapped === "insufficient_data" ? "unknown" : mapped}-bg)`;
}
