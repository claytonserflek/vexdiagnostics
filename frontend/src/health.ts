/**
 * Presentation-layer summary metrics for the dashboard/history views.
 *
 * IMPORTANT: none of this recomputes diagnostics or invents new evidence.
 * The backend (see backend/app/diagnostics.py) already does the real
 * statistical work -- per-motor classifications, paired t-tests between
 * sides, practical-significance gates -- and that full detail stays
 * visible on the results page. Everything here is a deterministic,
 * documented *rollup* of that same output into single numbers (a 0-100
 * "health score", a per-side "resistance score") purely so a dashboard
 * and a history table have something compact to show. If you need the
 * actual evidence behind a number shown here, it's the same
 * DiagnosticsResult these functions read from -- nothing is hidden.
 */
import type { DiagnosticsResult, MotorClassification, MotorFinding, MotorSummary, SideComparison } from "./types";

export type StatusTier = "healthy" | "monitor" | "inspect" | "critical";

export const STATUS_LABEL: Record<StatusTier, string> = {
  healthy: "Healthy",
  monitor: "Monitor",
  inspect: "Inspect",
  critical: "Critical",
};

export function motorFindingStatus(classification: MotorClassification): StatusTier {
  switch (classification) {
    case "High Resistance":
      return "inspect";
    case "Possible High Resistance":
    case "Possible Mechanism Binding":
      return "monitor";
    default:
      return "healthy";
  }
}

/** Higher = worse, used to pick the single "flagged motor" for a test. */
function severityRank(classification: MotorClassification): number {
  switch (classification) {
    case "High Resistance":
      return 3;
    case "Possible High Resistance":
      return 2;
    case "Possible Mechanism Binding":
      return 1;
    default:
      return 0;
  }
}

export function worstMotorFinding(findings: MotorFinding[]): MotorFinding | null {
  let worst: MotorFinding | null = null;
  for (const f of findings) {
    if (!worst || severityRank(f.classification) > severityRank(worst.classification)) {
      worst = f;
    }
  }
  return worst && severityRank(worst.classification) > 0 ? worst : null;
}

/**
 * A single 0-100 rollup of test health, derived from the backend's own
 * classifications:
 *  - overall_classification sets a baseline penalty (this already
 *    reflects the statistically-tested left/right comparison, so it
 *    carries most of the weight)
 *  - each individually-flagged motor subtracts a bit more, since a
 *    single-motor issue that doesn't reach side-level significance is
 *    still worth surfacing on a dashboard
 * Returns null when there isn't enough data to say anything (mirrors
 * the backend's own "insufficient_data" case).
 */
export function computeHealthScore(diagnostics: DiagnosticsResult): number | null {
  if (diagnostics.overall_classification === "insufficient_data") return null;

  const baseline: Record<string, number> = { normal: 100, possible: 78, high: 55 };
  let score = baseline[diagnostics.overall_classification] ?? 70;

  for (const f of diagnostics.motor_findings) {
    if (f.classification === "High Resistance") score -= 8;
    else if (f.classification === "Possible High Resistance" || f.classification === "Possible Mechanism Binding") {
      score -= 4;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreToStatus(score: number): StatusTier {
  if (score >= 85) return "healthy";
  if (score >= 70) return "monitor";
  if (score >= 50) return "inspect";
  return "critical";
}

export function overallStatus(diagnostics: DiagnosticsResult): StatusTier | "unknown" {
  const score = computeHealthScore(diagnostics);
  return score === null ? "unknown" : scoreToStatus(score);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * A per-side (0-100-ish) resistance indicator, built from the same
 * numbers docs/diagnostics-algorithm.md defines: each flagged motor on
 * that side contributes a fixed amount, the side's own average velocity
 * deficit contributes a small baseline (telemetry always has some
 * residual noise), and the side gets an extra bump only if the backend's
 * paired comparison flags it as the statistically worse side. This is a
 * display convenience, not a new statistical test -- the real test is
 * `side_comparisons` on the DiagnosticsResult.
 */
export function computeSideResistanceScore(side: "L" | "R", diagnostics: DiagnosticsResult): number | null {
  const sideMotors = diagnostics.motor_summaries.filter((s) => s.side === side);
  if (sideMotors.length === 0) return null;

  const sideLabels = new Set(sideMotors.map((s) => s.label));
  const findings = diagnostics.motor_findings.filter((f) => sideLabels.has(f.label));

  let score = 0;
  for (const f of findings) {
    if (f.classification === "High Resistance") score += 35;
    else if (f.classification === "Possible High Resistance" || f.classification === "Possible Mechanism Binding") {
      score += 15;
    }
  }

  const avgDeficit = mean(sideMotors.map((s) => s.velocity_deficit_mean).filter((v): v is number => v !== null));
  if (avgDeficit !== null) score += Math.max(0, Math.min(20, avgDeficit * 2));

  const velComp = diagnostics.side_comparisons.find(
    (c): c is SideComparison => c.metric === "velocity_deficit_pct",
  );
  if (velComp && velComp.significance !== "none" && velComp.practical_threshold_met) {
    const worseSide = velComp.mean_diff > 0 ? "R" : "L";
    if (worseSide === side) {
      score += Math.max(0, Math.min(25, Math.abs(velComp.mean_diff) * 2));
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function statusColorVar(status: StatusTier | "unknown"): string {
  return status === "unknown" ? "var(--status-neutral)" : `var(--status-${status})`;
}

/** Average current (A) and average velocity (RPM) across a side's
 * motors -- shared by the results page and the compare page so the same
 * numbers are computed the same way in both places. avg_velocity_rpm_mean
 * comes straight from the backend (a real measured average, not
 * back-derived from a commanded speed), so this works whether or not the
 * test had commanded-velocity telemetry at all. */
export function sideAverages(
  side: "L" | "R",
  diagnostics: DiagnosticsResult,
): { avgCurrentA: number | null; avgVelocity: number | null; motorCount: number } {
  const motors = diagnostics.motor_summaries.filter((s) => s.side === side);
  const currents = motors.map((m) => m.current_mean).filter((v): v is number => v !== null);
  const velocities = motors.map((m) => m.avg_velocity_rpm_mean).filter((v): v is number => v !== null);

  const avgCurrentA = currents.length ? mean(currents)! / 1000 : null;
  const avgVelocity = velocities.length ? mean(velocities) : null;

  return { avgCurrentA, avgVelocity, motorCount: motors.length };
}

/** True when this test has at least one motor whose label resolved to a
 * left/right side -- the signal used everywhere in the UI to decide
 * whether to show drivetrain-specific sections (the side comparison
 * panel, the top-down layout diagram) at all. A generic mechanism (an
 * intake, an arm, a claw, ...) never trips this. */
export function hasDrivetrainMotors(diagnostics: DiagnosticsResult): boolean {
  return diagnostics.motor_summaries.some((s) => s.side !== null);
}

/** "drivetrain_resistance_v1" -> "Drivetrain Resistance",
 * "motor_telemetry_v1" -> "Motor Telemetry". Purely cosmetic. */
export function formatTestType(testType: string): string {
  const stripped = testType.replace(/_v\d+$/i, "");
  return stripped
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Bucketing for the per-side resistance score, which runs the opposite
 * direction from the health score (0 = no indication, higher = more). */
export function resistanceScoreStatus(score: number): StatusTier {
  if (score >= 60) return "critical";
  if (score >= 35) return "inspect";
  if (score >= 15) return "monitor";
  return "healthy";
}

export const INSPECT_AREAS_DRIVETRAIN = [
  "Shaft alignment",
  "Bearing friction",
  "Gear spacing",
  "Wheel contact",
  "Frame alignment",
];

export const INSPECT_AREAS_GENERIC = [
  "Mounting and fasteners",
  "Bearing condition",
  "Gear engagement",
  "Belt or chain tension",
  "Obstruction in the mechanism",
];

/** Drivetrain-specific inspection points only make sense for a motor
 * that's actually part of an identified drivetrain side; anything else
 * (an intake, an arm, a claw, ...) gets the generic mechanical list. */
export function inspectAreasFor(summary: MotorSummary | undefined): string[] {
  return summary?.side ? INSPECT_AREAS_DRIVETRAIN : INSPECT_AREAS_GENERIC;
}

/** A short dashboard/results headline. The full statistical explanation
 * (docs/diagnostics-algorithm.md-level detail) stays available as
 * diagnostics.overall_summary; this is just a compact version of the
 * same, real conclusion for a banner. */
export function resultHeadline(diagnostics: DiagnosticsResult): string {
  const sideName = diagnostics.worse_side === "L" ? "left" : diagnostics.worse_side === "R" ? "right" : null;
  if (diagnostics.overall_classification === "high" && sideName) {
    return `Resistance indicated on ${sideName} drivetrain`;
  }
  if (diagnostics.overall_classification === "possible" && sideName) {
    return `Possible resistance detected on ${sideName} drivetrain`;
  }
  if (diagnostics.overall_classification === "possible") {
    return "Possible motor abnormality detected";
  }
  if (diagnostics.overall_classification === "normal") {
    return hasDrivetrainMotors(diagnostics)
      ? "No significant resistance asymmetry detected"
      : "No abnormal motor behavior detected";
  }
  return "Not enough matching telemetry to compare motors";
}

/** Careful, non-overclaiming description of what a flagged motor's
 * numbers actually show -- never states a physical cause as proven. */
export function abnormalityDescription(finding: MotorFinding): string {
  const velUp = (finding.velocity_gap_pts ?? 0) > 0;
  const curUp = (finding.current_gap_pct ?? 0) > 0;
  if (finding.classification === "Possible Mechanism Binding") {
    return "Slower acceleration (or slower ramp-up) than equivalent motors, without a matching steady-state velocity or current difference -- a pattern more consistent with something intermittently catching than steady resistance.";
  }
  if (velUp && curUp) {
    return "Higher current draw combined with lower velocity compared with equivalent motors in this test.";
  }
  if (curUp) {
    return "Higher current draw than equivalent motors in this test.";
  }
  if (velUp) {
    return "Lower velocity than equivalent motors in this test.";
  }
  return "Telemetry differs from equivalent motors in this test.";
}

/** Front/back + left/right layout slot, guessed from a motor's label for
 * purely visual positioning (FL/FR/BL/BR grid, top-down diagram). This
 * never affects diagnostics -- it's the same kind of best-effort text
 * match as the backend's own infer_side(), just for layout. */
export type Slot = "FL" | "FR" | "BL" | "BR";

export function inferSlot(summary: MotorSummary): Slot | null {
  const lower = summary.label.toLowerCase();
  let front: boolean | null = null;
  if (lower.includes("front")) front = true;
  else if (lower.includes("back") || lower.includes("rear")) front = false;
  else {
    const letters = summary.label.toUpperCase().replace(/[^A-Z]/g, "");
    if (letters.length > 0 && [...letters].every((c) => "FBLR".includes(c))) {
      const hasF = letters.includes("F");
      const hasB = letters.includes("B");
      if (hasF && !hasB) front = true;
      else if (hasB && !hasF) front = false;
    }
  }
  if (front === null || summary.side === null) return null;
  if (front && summary.side === "L") return "FL";
  if (front && summary.side === "R") return "FR";
  if (!front && summary.side === "L") return "BL";
  return "BR";
}

/** FL, FR, BL, BR in that order when recognized, then anything else. */
export function orderMotorsForDisplay(summaries: MotorSummary[]): MotorSummary[] {
  const order: Slot[] = ["FL", "FR", "BL", "BR"];
  const bySlot = new Map<Slot, MotorSummary>();
  const rest: MotorSummary[] = [];
  for (const s of summaries) {
    const slot = inferSlot(s);
    if (slot && !bySlot.has(slot)) bySlot.set(slot, s);
    else rest.push(s);
  }
  return [...order.map((o) => bySlot.get(o)).filter((x): x is MotorSummary => !!x), ...rest];
}
