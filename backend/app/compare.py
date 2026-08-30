"""Before/after test comparison -- turns two diagnostic runs into a
percentage-change view teams can use to judge whether a mechanical
modification actually helped."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .diagnostics import DiagnosticsResult


@dataclass
class MotorComparison:
    label: str
    velocity_deficit_before: Optional[float]
    velocity_deficit_after: Optional[float]
    velocity_deficit_change_pts: Optional[float]
    current_before: Optional[float]
    current_after: Optional[float]
    current_change_pct: Optional[float]


@dataclass
class ComparisonResult:
    warnings: list = field(default_factory=list)
    motor_comparisons: list = field(default_factory=list)
    side_asymmetry_before_pts: Optional[float] = None
    side_asymmetry_after_pts: Optional[float] = None
    side_asymmetry_change_pct: Optional[float] = None
    summary: str = ""


def _side_velocity_asymmetry(result: DiagnosticsResult) -> Optional[float]:
    vel = next((c for c in result.side_comparisons if c.metric == "velocity_deficit_pct"), None)
    return abs(vel.mean_diff) if vel else None


def compare_tests(
    before: DiagnosticsResult,
    after: DiagnosticsResult,
    before_meta: dict,
    after_meta: dict,
) -> ComparisonResult:
    warnings: list = []

    before_rpm = before_meta.get("commanded_cruise_rpm")
    after_rpm = after_meta.get("commanded_cruise_rpm")
    if before_rpm is not None and after_rpm is not None and before_rpm != after_rpm:
        warnings.append(
            "The two tests used different commanded cruise velocities "
            f"({before_rpm} vs {after_rpm} RPM); percentage comparisons may not be directly meaningful."
        )

    before_labels = {s.label for s in before.motor_summaries}
    after_labels = {s.label for s in after.motor_summaries}
    if before_labels != after_labels:
        warnings.append(
            "The two tests have different motor labels; only motors present in both tests are compared."
        )

    before_by_label = {s.label: s for s in before.motor_summaries}
    after_by_label = {s.label: s for s in after.motor_summaries}

    motor_comparisons = []
    for label in sorted(before_labels & after_labels):
        b = before_by_label[label]
        a = after_by_label[label]

        v_change = None
        if a.velocity_deficit_mean is not None and b.velocity_deficit_mean is not None:
            v_change = a.velocity_deficit_mean - b.velocity_deficit_mean

        c_change_pct = None
        if a.current_mean is not None and b.current_mean is not None and b.current_mean != 0:
            c_change_pct = (a.current_mean - b.current_mean) / b.current_mean * 100.0

        motor_comparisons.append(
            MotorComparison(
                label=label,
                velocity_deficit_before=b.velocity_deficit_mean,
                velocity_deficit_after=a.velocity_deficit_mean,
                velocity_deficit_change_pts=v_change,
                current_before=b.current_mean,
                current_after=a.current_mean,
                current_change_pct=c_change_pct,
            )
        )

    before_asym = _side_velocity_asymmetry(before)
    after_asym = _side_velocity_asymmetry(after)
    asym_change_pct = None
    if before_asym is not None and after_asym is not None and before_asym != 0:
        asym_change_pct = (after_asym - before_asym) / before_asym * 100.0

    if before_asym is not None and after_asym is not None:
        if after_asym < before_asym:
            direction = "decreased"
        elif after_asym > before_asym:
            direction = "increased"
        else:
            direction = "did not change"
        summary = (
            f"Left/right velocity-deficit asymmetry {direction} from {before_asym:.1f} to "
            f"{after_asym:.1f} percentage points between the two tests."
        )
    else:
        summary = "Not enough matching left/right data in both tests to compare side asymmetry directly."

    return ComparisonResult(
        warnings=warnings,
        motor_comparisons=motor_comparisons,
        side_asymmetry_before_pts=before_asym,
        side_asymmetry_after_pts=after_asym,
        side_asymmetry_change_pct=asym_change_pct,
        summary=summary,
    )
