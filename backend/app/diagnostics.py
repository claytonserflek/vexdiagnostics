"""Deterministic, mechanism-agnostic motor diagnostics engine.

No machine learning, no external AI calls. Every number here is plain
arithmetic over the imported telemetry, chosen so a human can reproduce
any result by hand from the raw CSV. See `docs/diagnostics-algorithm.md`
for the full rationale behind each constant and threshold below -- this
module intentionally mirrors that document step by step.

This engine works on telemetry from ANY VEX mechanism (drivetrain,
intake, lift, arm, flywheel, ...), not only a drivetrain. Two things are
handled as genuine specializations rather than baked-in assumptions:

- Left/right drivetrain comparison (`side_comparisons`, `worse_side`) only
  activates when motor labels actually resolve to left/right groups via
  `infer_side` -- see step 3. Motors that don't (an intake, an arm, ...)
  simply never enter that comparison; they still get full per-motor
  analysis below.
- Velocity-based diagnostics (steady-state deficit vs. a commanded speed,
  acceleration lag) require commanded-velocity telemetry. When a motor
  has none, this engine does NOT invent a target -- it falls back to
  comparing that motor's raw velocity against comparable motors instead,
  and callers can tell the difference via `MotorSummary.has_commanded_data`.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Optional

from scipy import stats

# ---------------------------------------------------------------------------
# Tunable constants (see docs/diagnostics-algorithm.md for justification).
# Centralized here, not scattered through the logic, so they can be revised
# as real field data accumulates without hunting through the code.
# ---------------------------------------------------------------------------

STEADY_STATE_FRACTION = 0.4          # trailing fraction of a phase used as "steady state"
TARGET_FRACTION_FOR_LAG = 0.9        # fraction of commanded speed that counts as "reached"
PHASE_COMMANDED_ROUND_RPM = 10       # rounding grid used to detect phase boundaries
MIN_PHASE_SAMPLES = 5                # ignore spuriously short commanded phases

VELOCITY_ABS_THRESHOLD_PTS = 5.0     # percentage points (commanded-mode deficit gap)
VELOCITY_RAW_ABS_THRESHOLD_PCT = 15.0  # percent (uncommanded-mode raw-velocity gap)
CURRENT_ABS_THRESHOLD_PCT = 15.0     # percent relative to comparison group
ACCEL_LAG_ABS_THRESHOLD_MS = 150.0
NOISE_FLOOR_MULTIPLIER = 2.0         # gap must exceed 2x the motor's own trial-to-trial SD

SIDE_VELOCITY_PRACTICAL_PTS = 3.0
SIDE_CURRENT_PRACTICAL_PCT = 10.0
P_STRONG = 0.05
P_WEAK = 0.10

VARIABILITY_COV_MULTIPLIER = 2.0
TEMP_RISE_RATIO_THRESHOLD = 1.5
MOTOR_TEMP_WARNING_C = 55.0          # conservative field heuristic, not a manufacturer spec


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class TelemetrySample:
    timestamp_ms: int
    motor_label: str
    actual_velocity_rpm: float
    commanded_velocity_rpm: Optional[float]
    current_ma: Optional[float]
    voltage_mv: Optional[float]
    power_w: Optional[float]
    torque_nm: Optional[float]
    temperature_c: Optional[float]
    position_deg: Optional[float]
    trial: int


@dataclass
class _MotorObservation:
    """One comparable "window" of a motor's behavior within a trial.

    In commanded mode this is a single commanded-velocity phase (as
    before). In uncommanded mode (no usable commanded data for this
    motor/trial) it's the whole trial treated as one window -- there's no
    target to segment phases against, so there's nothing to gain from
    trying to split it further.
    """

    motor_label: str
    trial: int
    phase_order: int  # ordinal index within its trial; always 0 in uncommanded mode
    commanded_rpm: Optional[float]
    velocity_deficit_pct: Optional[float]
    steady_current_ma: Optional[float]
    raw_velocity_rpm: Optional[float]
    accel_lag_ms: Optional[float]
    reached_target: bool


@dataclass
class MotorSummary:
    label: str
    side: Optional[str]  # "L", "R", or None if unrecognized
    has_commanded_data: bool
    n_phase_samples: int
    velocity_deficit_mean: Optional[float]
    velocity_deficit_sd: Optional[float]
    avg_velocity_rpm_mean: Optional[float]
    avg_velocity_rpm_sd: Optional[float]
    current_mean: Optional[float]
    current_sd: Optional[float]
    current_cov: Optional[float]
    accel_lag_mean: Optional[float]
    accel_lag_sd: Optional[float]
    temp_rise_c: Optional[float]
    temp_max_c: Optional[float]


@dataclass
class MotorFinding:
    label: str
    classification: str
    velocity_gap_pts: Optional[float]
    current_gap_pct: Optional[float]
    accel_gap_ms: Optional[float]
    notes: list = field(default_factory=list)


@dataclass
class SideComparison:
    metric: str
    left_mean: float
    right_mean: float
    mean_diff: float  # right - left
    p_value: Optional[float]
    n_pairs: int
    practical_threshold_met: bool
    significance: str  # "none" | "weak" | "strong"


@dataclass
class DiagnosticsResult:
    motor_summaries: list
    motor_findings: list
    side_comparisons: list
    overall_classification: str  # "normal" | "possible" | "high" | "insufficient_data"
    overall_summary: str
    worse_side: Optional[str]


# ---------------------------------------------------------------------------
# Side inference from motor labels
# ---------------------------------------------------------------------------

_SIDE_CODE_LETTERS = {"F", "B", "L", "R"}


def infer_side(label: str) -> Optional[str]:
    """Best-effort left/right classification from a motor label.

    Recognizes explicit "left"/"right" substrings first, then falls back to
    short VEX-style position codes built only from F/B/L/R initials (FL, BR,
    L, RF, ...). Anything else returns None and is simply excluded from
    left/right comparisons rather than guessed at. This is what gates the
    drivetrain-specific comparison below: a motor named "intake" or "arm"
    never matches, so it never gets forced into a left/right comparison.
    """
    lowered = label.lower()
    has_left_word = "left" in lowered
    has_right_word = "right" in lowered
    if has_left_word and not has_right_word:
        return "L"
    if has_right_word and not has_left_word:
        return "R"
    if has_left_word and has_right_word:
        return None

    letters = [c for c in label.upper() if c.isalpha()]
    if letters and set(letters).issubset(_SIDE_CODE_LETTERS):
        has_l = "L" in letters
        has_r = "R" in letters
        if has_l and not has_r:
            return "L"
        if has_r and not has_l:
            return "R"
    return None


# ---------------------------------------------------------------------------
# Step 1-2: observation extraction and per-motor summary
# ---------------------------------------------------------------------------


def _extract_observations(samples: list) -> list:
    """Segment one (motor, trial) group's samples (sorted by time) into
    commanded-velocity phases. Falls back to a single whole-trial
    observation when there's no usable commanded data at all -- current,
    temperature, and raw velocity can still be evaluated even though
    nothing depends on a commanded speed."""
    commanded_samples = [s for s in samples if s.commanded_velocity_rpm is not None]

    phases = []

    def flush(group, command, order):
        if len(group) < MIN_PHASE_SAMPLES or command is None:
            return None
        rounded = round(command / PHASE_COMMANDED_ROUND_RPM) * PHASE_COMMANDED_ROUND_RPM
        if rounded == 0:
            return None  # not a cruise phase
        group_sorted = sorted(group, key=lambda s: s.timestamp_ms)
        start_ts = group_sorted[0].timestamp_ms
        target = abs(command) * TARGET_FRACTION_FOR_LAG
        accel_lag_ms = None
        reached_target = False
        for s in group_sorted:
            if abs(s.actual_velocity_rpm) >= target:
                accel_lag_ms = s.timestamp_ms - start_ts
                reached_target = True
                break
        if not reached_target:
            accel_lag_ms = group_sorted[-1].timestamp_ms - start_ts

        steady_count = max(1, int(len(group_sorted) * STEADY_STATE_FRACTION))
        steady_window = group_sorted[-steady_count:]
        deficits = [
            (abs(command) - abs(s.actual_velocity_rpm)) / abs(command) * 100.0
            for s in steady_window
            if command != 0
        ]
        currents = [s.current_ma for s in steady_window if s.current_ma is not None]
        raw_velocities = [abs(s.actual_velocity_rpm) for s in steady_window]

        return _MotorObservation(
            motor_label=group_sorted[0].motor_label,
            trial=group_sorted[0].trial,
            phase_order=order,
            commanded_rpm=command,
            velocity_deficit_pct=statistics.mean(deficits) if deficits else None,
            steady_current_ma=statistics.mean(currents) if currents else None,
            raw_velocity_rpm=statistics.mean(raw_velocities) if raw_velocities else None,
            accel_lag_ms=accel_lag_ms,
            reached_target=reached_target,
        )

    order = 0
    current_group: list = []
    current_command = None
    for s in commanded_samples:
        rounded = round(s.commanded_velocity_rpm / PHASE_COMMANDED_ROUND_RPM) * PHASE_COMMANDED_ROUND_RPM
        if current_command is None or rounded != round(
            (current_command or 0) / PHASE_COMMANDED_ROUND_RPM
        ) * PHASE_COMMANDED_ROUND_RPM:
            obs = flush(current_group, current_command, order)
            if obs is not None:
                phases.append(obs)
                order += 1
            current_group = []
            current_command = s.commanded_velocity_rpm
        current_group.append(s)
    obs = flush(current_group, current_command, order)
    if obs is not None:
        phases.append(obs)

    if phases:
        return phases

    # Uncommanded fallback: no motor/trial group makes it here with any
    # real commanded data, so treat the whole trial as one window rather
    # than reporting nothing. No MIN_PHASE_SAMPLES gate -- even a single
    # sample is a legitimate (if noisy) reading.
    if not samples:
        return []
    group_sorted = sorted(samples, key=lambda s: s.timestamp_ms)
    currents = [s.current_ma for s in group_sorted if s.current_ma is not None]
    raw_velocities = [abs(s.actual_velocity_rpm) for s in group_sorted]
    return [
        _MotorObservation(
            motor_label=group_sorted[0].motor_label,
            trial=group_sorted[0].trial,
            phase_order=0,
            commanded_rpm=None,
            velocity_deficit_pct=None,
            steady_current_ma=statistics.mean(currents) if currents else None,
            raw_velocity_rpm=statistics.mean(raw_velocities) if raw_velocities else None,
            accel_lag_ms=None,
            reached_target=False,
        )
    ]


def _motor_observations(samples: list) -> dict:
    """Group samples by motor label and trial, then extract observations
    for each."""
    by_motor_trial: dict = {}
    for s in samples:
        by_motor_trial.setdefault((s.motor_label, s.trial), []).append(s)

    by_motor: dict = {}
    for (label, trial), group in by_motor_trial.items():
        group_sorted = sorted(group, key=lambda s: s.timestamp_ms)
        for obs in _extract_observations(group_sorted):
            by_motor.setdefault(label, []).append(obs)
    return by_motor


def _summarize_motor(label: str, observations: list, raw_samples: list) -> MotorSummary:
    deficits = [o.velocity_deficit_pct for o in observations if o.velocity_deficit_pct is not None]
    currents = [o.steady_current_ma for o in observations if o.steady_current_ma is not None]
    raw_velocities = [o.raw_velocity_rpm for o in observations if o.raw_velocity_rpm is not None]
    lags = [o.accel_lag_ms for o in observations if o.accel_lag_ms is not None]
    has_commanded_data = any(o.commanded_rpm is not None for o in observations)

    def mean_sd(values):
        if not values:
            return None, None
        m = statistics.mean(values)
        sd = statistics.stdev(values) if len(values) >= 2 else 0.0
        return m, sd

    v_mean, v_sd = mean_sd(deficits)
    rv_mean, rv_sd = mean_sd(raw_velocities)
    c_mean, c_sd = mean_sd(currents)
    a_mean, a_sd = mean_sd(lags)
    cov = (c_sd / c_mean) if (c_mean and c_sd is not None and c_mean != 0) else None

    temps = [s.temperature_c for s in raw_samples if s.temperature_c is not None]
    temp_rise = None
    temp_max = None
    if temps:
        by_time = sorted(
            ((s.timestamp_ms, s.trial, s.temperature_c) for s in raw_samples if s.temperature_c is not None),
        )
        temp_rise = by_time[-1][2] - by_time[0][2]
        temp_max = max(temps)

    return MotorSummary(
        label=label,
        side=infer_side(label),
        has_commanded_data=has_commanded_data,
        n_phase_samples=len(observations),
        velocity_deficit_mean=v_mean,
        velocity_deficit_sd=v_sd,
        avg_velocity_rpm_mean=rv_mean,
        avg_velocity_rpm_sd=rv_sd,
        current_mean=c_mean,
        current_sd=c_sd,
        current_cov=cov,
        accel_lag_mean=a_mean,
        accel_lag_sd=a_sd,
        temp_rise_c=temp_rise,
        temp_max_c=temp_max,
    )


# ---------------------------------------------------------------------------
# Step 3: side-level statistical comparison (drivetrain specialization)
# ---------------------------------------------------------------------------


def _side_comparison(
    metric_name: str,
    by_motor_obs: dict,
    motor_sides: dict,
) -> Optional[SideComparison]:
    left_motors = [m for m, side in motor_sides.items() if side == "L"]
    right_motors = [m for m, side in motor_sides.items() if side == "R"]
    if not left_motors or not right_motors:
        return None

    def value_of(obs):
        return obs.velocity_deficit_pct if metric_name == "velocity_deficit_pct" else obs.steady_current_ma

    # Index observations by (trial, phase_order) per motor. In uncommanded
    # mode phase_order is always 0, so this still pairs correctly per
    # trial; steady_current_ma is available either way, while
    # velocity_deficit_pct naturally stays unavailable (None) for
    # uncommanded motors and drops out of this comparison on its own.
    left_by_key: dict = {}
    for m in left_motors:
        for obs in by_motor_obs.get(m, []):
            v = value_of(obs)
            if v is not None:
                left_by_key.setdefault((obs.trial, obs.phase_order), []).append(v)
    right_by_key: dict = {}
    for m in right_motors:
        for obs in by_motor_obs.get(m, []):
            v = value_of(obs)
            if v is not None:
                right_by_key.setdefault((obs.trial, obs.phase_order), []).append(v)

    shared_keys = sorted(set(left_by_key) & set(right_by_key))
    left_vals = [statistics.mean(left_by_key[k]) for k in shared_keys]
    right_vals = [statistics.mean(right_by_key[k]) for k in shared_keys]

    if len(shared_keys) < 2:
        return None

    diffs = [r - l for l, r in zip(left_vals, right_vals)]
    mean_diff = statistics.mean(diffs)

    p_value = None
    if len(diffs) >= 2 and any(d != diffs[0] for d in diffs):
        t_result = stats.ttest_1samp(diffs, popmean=0.0)
        p_value = float(t_result.pvalue)
    elif len(diffs) >= 2:
        p_value = 0.0 if mean_diff != 0 else 1.0

    threshold = SIDE_VELOCITY_PRACTICAL_PTS if metric_name == "velocity_deficit_pct" else None
    if metric_name == "steady_current_ma":
        base = statistics.mean(left_vals + right_vals)
        practical_met = base != 0 and abs(mean_diff) / abs(base) * 100.0 >= SIDE_CURRENT_PRACTICAL_PCT
    else:
        practical_met = abs(mean_diff) >= (threshold or 0)

    if p_value is None:
        significance = "none"
    elif p_value < P_STRONG:
        significance = "strong"
    elif p_value < P_WEAK:
        significance = "weak"
    else:
        significance = "none"

    return SideComparison(
        metric=metric_name,
        left_mean=statistics.mean(left_vals),
        right_mean=statistics.mean(right_vals),
        mean_diff=mean_diff,
        p_value=p_value,
        n_pairs=len(shared_keys),
        practical_threshold_met=practical_met,
        significance=significance,
    )


# ---------------------------------------------------------------------------
# Step 4-6: per-motor findings (mechanism-agnostic)
# ---------------------------------------------------------------------------


def _motor_finding(summary: MotorSummary, all_summaries: list, median_cov: Optional[float]) -> MotorFinding:
    others = [s for s in all_summaries if s.label != summary.label]
    notes: list = []

    def gap(attr, others_attr=None):
        others_attr = others_attr or attr
        own = getattr(summary, attr)
        other_vals = [getattr(s, others_attr) for s in others if getattr(s, others_attr) is not None]
        if own is None or not other_vals:
            return None, None
        others_mean = statistics.mean(other_vals)
        return own - others_mean, others_mean

    def exceeds_noise_floor(gap_value, sd):
        if gap_value is None:
            return False
        if sd is None:
            return True  # no noise estimate available; fall back to the absolute threshold only
        return abs(gap_value) > NOISE_FLOOR_MULTIPLIER * sd

    a_gap, _ = gap("accel_lag_mean")
    c_own_others_gap, c_others_mean = gap("current_mean")
    c_gap_pct = None
    if c_own_others_gap is not None and c_others_mean not in (None, 0):
        c_gap_pct = c_own_others_gap / c_others_mean * 100.0
    current_elevated = (
        c_gap_pct is not None
        and c_gap_pct >= CURRENT_ABS_THRESHOLD_PCT
        and exceeds_noise_floor(c_own_others_gap, summary.current_sd)
    )
    accel_elevated = (
        a_gap is not None
        and a_gap >= ACCEL_LAG_ABS_THRESHOLD_MS
        and exceeds_noise_floor(a_gap, summary.accel_lag_sd)
    )

    if summary.has_commanded_data:
        # Commanded mode: steady-state velocity deficit is the precise
        # signal (it's already speed-normalized).
        v_gap, _ = gap("velocity_deficit_mean")
        velocity_gap_pts = v_gap
        velocity_elevated = (
            v_gap is not None
            and v_gap >= VELOCITY_ABS_THRESHOLD_PTS
            and exceeds_noise_floor(v_gap, summary.velocity_deficit_sd)
        )
    else:
        # Uncommanded mode: no target to compute a deficit against, so
        # fall back to comparing raw velocity against OTHER uncommanded
        # motors only (comparing a raw RPM to a commanded-mode motor's
        # deficit-normalized figure wouldn't be apples-to-apples).
        comparable = [s for s in others if not s.has_commanded_data and s.avg_velocity_rpm_mean is not None]
        velocity_gap_pts = None
        velocity_elevated = False
        if summary.avg_velocity_rpm_mean is not None and comparable:
            others_mean = statistics.mean(s.avg_velocity_rpm_mean for s in comparable)
            if others_mean != 0:
                # Positive = this motor is slower than comparable motors (worse),
                # matching the sign convention used everywhere else in this function.
                raw_gap_pct = (others_mean - summary.avg_velocity_rpm_mean) / others_mean * 100.0
                velocity_gap_pts = raw_gap_pct
                velocity_elevated = raw_gap_pct >= VELOCITY_RAW_ABS_THRESHOLD_PCT and exceeds_noise_floor(
                    others_mean - summary.avg_velocity_rpm_mean, summary.avg_velocity_rpm_sd
                )

    if velocity_elevated and current_elevated:
        classification = "High Resistance"
    elif velocity_elevated or current_elevated:
        classification = "Possible High Resistance"
    elif accel_elevated:
        classification = "Possible Mechanism Binding"
    else:
        classification = "Normal"

    if summary.current_cov is not None and median_cov and summary.current_cov > VARIABILITY_COV_MULTIPLIER * median_cov:
        notes.append(
            "Current draw is unusually inconsistent trial-to-trial relative to other motors in this test "
            "-- consider checking for something intermittently catching rather than steady resistance."
        )

    if summary.temp_max_c is not None and summary.temp_max_c >= MOTOR_TEMP_WARNING_C:
        notes.append(f"Reached {summary.temp_max_c:.0f}C during the test -- monitor for overheating.")

    return MotorFinding(
        label=summary.label,
        classification=classification,
        velocity_gap_pts=velocity_gap_pts,
        current_gap_pct=c_gap_pct,
        accel_gap_ms=a_gap,
        notes=notes,
    )


def _temperature_notes(all_summaries: list) -> dict:
    """Return {label: note} for motors whose temperature rise stands out."""
    rises = [(s.label, s.temp_rise_c) for s in all_summaries if s.temp_rise_c is not None]
    notes: dict = {}
    if len(rises) < 2:
        return notes
    sorted_rises = sorted(rises, key=lambda t: t[1], reverse=True)
    top_label, top_rise = sorted_rises[0]
    second_rise = sorted_rises[1][1]
    if top_rise > 0 and second_rise > 0 and top_rise / second_rise >= TEMP_RISE_RATIO_THRESHOLD:
        notes[top_label] = (
            f"Temperature rose {top_rise:.1f}C during the test, notably more than other motors in this test."
        )
    return notes


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def compute_diagnostics(samples: list) -> DiagnosticsResult:
    if not samples:
        return DiagnosticsResult(
            motor_summaries=[],
            motor_findings=[],
            side_comparisons=[],
            overall_classification="insufficient_data",
            overall_summary="No telemetry samples were found in this test.",
            worse_side=None,
        )

    by_motor_obs = _motor_observations(samples)
    by_motor_raw: dict = {}
    for s in samples:
        by_motor_raw.setdefault(s.motor_label, []).append(s)

    labels = sorted(by_motor_raw.keys())
    summaries = [
        _summarize_motor(label, by_motor_obs.get(label, []), by_motor_raw[label]) for label in labels
    ]
    motor_sides = {s.label: s.side for s in summaries}

    covs = [s.current_cov for s in summaries if s.current_cov is not None]
    median_cov = statistics.median(covs) if covs else None

    findings = [_motor_finding(s, summaries, median_cov) for s in summaries]
    temp_notes = _temperature_notes(summaries)
    for f in findings:
        if f.label in temp_notes:
            f.notes.append(temp_notes[f.label])

    side_comparisons = []
    for metric in ("velocity_deficit_pct", "steady_current_ma"):
        comp = _side_comparison(metric, by_motor_obs, motor_sides)
        if comp is not None:
            side_comparisons.append(comp)

    overall_classification, overall_summary, worse_side = _build_overall_summary(
        summaries, findings, side_comparisons
    )

    return DiagnosticsResult(
        motor_summaries=summaries,
        motor_findings=findings,
        side_comparisons=side_comparisons,
        overall_classification=overall_classification,
        overall_summary=overall_summary,
        worse_side=worse_side,
    )


def _build_overall_summary(summaries, findings, side_comparisons) -> tuple:
    vel_comp = next((c for c in side_comparisons if c.metric == "velocity_deficit_pct"), None)
    cur_comp = next((c for c in side_comparisons if c.metric == "steady_current_ma"), None)
    has_side_data = vel_comp is not None or cur_comp is not None

    passing = []
    for c in (vel_comp, cur_comp):
        if c and c.significance != "none" and c.practical_threshold_met:
            passing.append(c)

    worse_side = None
    if passing:
        worse_side = "R" if passing[0].mean_diff > 0 else "L"

    agree = (
        vel_comp
        and cur_comp
        and vel_comp.mean_diff != 0
        and cur_comp.mean_diff != 0
        and (vel_comp.mean_diff > 0) == (cur_comp.mean_diff > 0)
    )

    if vel_comp and cur_comp and agree and len(passing) == 2:
        classification = "high"
    elif len(passing) >= 1:
        classification = "possible"
    else:
        classification = "normal"
        for f in findings:
            if f.classification in ("High Resistance", "Possible High Resistance"):
                classification = "possible"
                break

    side_name = {"L": "left", "R": "right"}.get(worse_side)
    lines = []

    if classification == "high" and side_name:
        conf = "strong" if (vel_comp.significance == "strong" or cur_comp.significance == "strong") else "weak"
        lines.append(
            f"The {side_name} drivetrain shows both higher current draw and lower velocity than the other "
            f"side under the same commanded speed ({conf} statistical evidence). This pattern is consistent "
            "with -- but does not confirm -- increased mechanical resistance on that side."
        )
    elif classification == "possible" and side_name:
        lines.append(
            f"The {side_name} drivetrain shows some indication of higher resistance than the other side, "
            "but the evidence is limited to one indicator or falls below the confidence threshold. Treat as a "
            "lead to investigate, not a confirmed finding."
        )
    elif classification == "possible":
        flagged = [f.label for f in findings if f.classification != "Normal"]
        if has_side_data:
            lines.append(
                f"Motor-to-motor comparison across the drivetrain flags {', '.join(flagged)} as showing a gap "
                "large enough, relative to comparable motors in this test, to be worth inspecting. This is "
                "based on individual motor telemetry, not a statistically tested left/right comparison."
            )
        else:
            lines.append(
                f"Motor-to-motor comparison flags {', '.join(flagged)} as showing a gap large enough, relative "
                "to comparable motors in this test, to be worth inspecting."
            )
    elif has_side_data:
        lines.append("No significant difference between the two drivetrain sides was detected in this test.")
    else:
        lines.append("No motor showed a telemetry gap large enough, relative to comparable motors in this test, to flag.")

    if classification in ("high", "possible") and side_name:
        lines.append(
            "Inspect shaft alignment, bearing friction, gear spacing, wheel contact, and frame alignment on "
            f"the {side_name} side."
        )
    elif classification == "possible":
        lines.append(
            "Inspect mounting and fasteners, bearing condition, gear engagement, and belt/chain tension on "
            "the flagged motor(s)."
        )

    return classification, " ".join(lines), worse_side
