export interface TestMeta {
  id: number;
  name: string;
  robot_name: string | null;
  test_type: string;
  recorded_at: string | null;
  imported_at: string | null;
  commanded_cruise_rpm: number | null;
  trial_count: number | null;
  notes: string | null;
  battery_pct: number | null;
  motors: Record<string, number | string>;
  source_filename: string | null;
}

export interface TestListItem extends TestMeta {
  overall_classification: OverallClassification;
  overall_summary: string;
}

export type OverallClassification = "normal" | "possible" | "high" | "insufficient_data";

export type MotorClassification =
  | "Normal"
  | "Possible High Resistance"
  | "High Resistance"
  | "Possible Mechanism Binding";

export interface MotorSummary {
  label: string;
  side: "L" | "R" | null;
  has_commanded_data: boolean;
  n_phase_samples: number;
  velocity_deficit_mean: number | null;
  velocity_deficit_sd: number | null;
  avg_velocity_rpm_mean: number | null;
  avg_velocity_rpm_sd: number | null;
  current_mean: number | null;
  current_sd: number | null;
  current_cov: number | null;
  accel_lag_mean: number | null;
  accel_lag_sd: number | null;
  temp_rise_c: number | null;
  temp_max_c: number | null;
}

export interface MotorFinding {
  label: string;
  classification: MotorClassification;
  velocity_gap_pts: number | null;
  current_gap_pct: number | null;
  accel_gap_ms: number | null;
  notes: string[];
}

export interface SideComparison {
  metric: "velocity_deficit_pct" | "steady_current_ma";
  left_mean: number;
  right_mean: number;
  mean_diff: number;
  p_value: number | null;
  n_pairs: number;
  practical_threshold_met: boolean;
  significance: "none" | "weak" | "strong";
}

export interface DiagnosticsResult {
  motor_summaries: MotorSummary[];
  motor_findings: MotorFinding[];
  side_comparisons: SideComparison[];
  overall_classification: OverallClassification;
  overall_summary: string;
  worse_side: "L" | "R" | null;
}

export interface TestDetailResponse {
  test: TestMeta;
  diagnostics: DiagnosticsResult;
}

export interface TelemetryPoint {
  timestamp_ms: number;
  trial: number;
  commanded_velocity_rpm: number | null;
  actual_velocity_rpm: number;
  current_ma: number | null;
  temperature_c: number | null;
}

export type TelemetrySeries = Record<string, TelemetryPoint[]>;

export interface MotorComparison {
  label: string;
  velocity_deficit_before: number | null;
  velocity_deficit_after: number | null;
  velocity_deficit_change_pts: number | null;
  current_before: number | null;
  current_after: number | null;
  current_change_pct: number | null;
}

export interface ComparisonResult {
  warnings: string[];
  motor_comparisons: MotorComparison[];
  side_asymmetry_before_pts: number | null;
  side_asymmetry_after_pts: number | null;
  side_asymmetry_change_pct: number | null;
  summary: string;
}

export interface CompareResponse {
  before: TestDetailResponse;
  after: TestDetailResponse;
  comparison: ComparisonResult;
}
