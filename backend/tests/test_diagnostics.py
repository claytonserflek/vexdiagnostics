from app import diagnostics as diag

from .helpers import build_run, build_uncommanded_run


def test_infer_side_recognizes_common_patterns():
    assert diag.infer_side("FL") == "L"
    assert diag.infer_side("FR") == "R"
    assert diag.infer_side("BL") == "L"
    assert diag.infer_side("BR") == "R"
    assert diag.infer_side("L") == "L"
    assert diag.infer_side("R") == "R"
    assert diag.infer_side("LeftFront") == "L"
    assert diag.infer_side("RightFront") == "R"
    assert diag.infer_side("Intake") is None
    assert diag.infer_side("Arm1") is None


def test_symmetric_run_is_classified_normal():
    samples = build_run({"FL": 0.02, "FR": 0.02, "BL": 0.02, "BR": 0.02}, seed=7)
    result = diag.compute_diagnostics(samples)

    assert result.overall_classification == "normal"
    for finding in result.motor_findings:
        assert finding.classification == "Normal"


def test_right_side_resistance_is_detected():
    samples = build_run({"FL": 0.02, "BL": 0.02, "FR": 0.45, "BR": 0.35}, seed=11)
    result = diag.compute_diagnostics(samples)

    assert result.overall_classification in ("high", "possible")
    assert result.worse_side == "R"

    vel_comp = next(c for c in result.side_comparisons if c.metric == "velocity_deficit_pct")
    cur_comp = next(c for c in result.side_comparisons if c.metric == "steady_current_ma")
    assert vel_comp.mean_diff > 0  # right side has a bigger velocity deficit
    assert cur_comp.mean_diff > 0  # right side draws more current

    findings_by_label = {f.label: f for f in result.motor_findings}
    assert findings_by_label["FR"].classification in ("High Resistance", "Possible High Resistance")
    assert findings_by_label["FL"].classification == "Normal"
    assert findings_by_label["BL"].classification == "Normal"


def test_left_side_resistance_flips_worse_side():
    samples = build_run({"FL": 0.45, "BL": 0.35, "FR": 0.02, "BR": 0.02}, seed=13)
    result = diag.compute_diagnostics(samples)

    assert result.worse_side == "L"
    vel_comp = next(c for c in result.side_comparisons if c.metric == "velocity_deficit_pct")
    assert vel_comp.mean_diff < 0


def test_empty_samples_returns_insufficient_data():
    result = diag.compute_diagnostics([])
    assert result.overall_classification == "insufficient_data"
    assert result.motor_summaries == []


def test_single_side_only_produces_no_side_comparisons():
    samples = build_run({"L1": 0.02, "L2": 0.4}, seed=17)
    result = diag.compute_diagnostics(samples)

    # Both motors are "L" side; there is no right side to compare against.
    assert result.side_comparisons == []
    # The individual-motor heuristic should still be able to flag L2 relative to L1.
    findings_by_label = {f.label: f for f in result.motor_findings}
    assert findings_by_label["L2"].classification in ("High Resistance", "Possible High Resistance")


def test_unrecognized_labels_are_summarized_but_not_side_compared():
    samples = build_run({"Intake": 0.02, "Arm": 0.4}, seed=19)
    result = diag.compute_diagnostics(samples)

    labels = {s.label for s in result.motor_summaries}
    assert labels == {"Intake", "Arm"}
    assert result.side_comparisons == []
    for s in result.motor_summaries:
        assert s.side is None


# ---------------------------------------------------------------------------
# Mechanism-agnostic / uncommanded-mode behavior
# ---------------------------------------------------------------------------


def test_missing_commanded_rpm_marks_velocity_deficit_unavailable():
    samples = build_uncommanded_run(
        {"m1": {"velocity": 500, "current": 800}, "m2": {"velocity": 500, "current": 800}}, seed=31
    )
    result = diag.compute_diagnostics(samples)

    assert result.overall_classification != "insufficient_data"
    for summary in result.motor_summaries:
        assert summary.has_commanded_data is False
        # The diagnostic that specifically depends on a commanded speed is
        # unavailable, not invented -- it stays None rather than being
        # backfilled with a guess.
        assert summary.velocity_deficit_mean is None
        assert summary.accel_lag_mean is None
        # But current and raw velocity, which don't depend on a commanded
        # target, are still fully computed.
        assert summary.current_mean is not None
        assert summary.avg_velocity_rpm_mean is not None


def test_generic_mechanism_flags_motor_with_elevated_current_and_low_velocity():
    samples = build_uncommanded_run(
        {
            "intake": {"velocity": 500, "current": 800},
            "arm": {"velocity": 500, "current": 800},
            "claw": {"velocity": 350, "current": 1400},
        },
        seed=33,
    )
    result = diag.compute_diagnostics(samples)

    findings_by_label = {f.label: f for f in result.motor_findings}
    assert findings_by_label["claw"].classification in ("High Resistance", "Possible High Resistance")
    assert findings_by_label["intake"].classification == "Normal"
    assert findings_by_label["arm"].classification == "Normal"
    assert result.overall_classification == "possible"
    # No drivetrain-flavored or left/right language for a mechanism with no
    # side data at all.
    assert "drivetrain" not in result.overall_summary.lower()
    assert "left/right" not in result.overall_summary.lower()


def test_uncommanded_drivetrain_named_motors_still_get_current_side_comparison():
    """No commanded column at all (like the feature request's example CSV),
    but the motor names ARE drivetrain-shaped. Velocity-based side
    comparison requires commanded data and stays unavailable, but current
    doesn't depend on it and should still produce a real comparison."""
    samples = build_uncommanded_run(
        {
            "front_left": {"velocity": 198, "current": 1210},
            "back_left": {"velocity": 201, "current": 1180},
            "front_right": {"velocity": 164, "current": 2080},
            "back_right": {"velocity": 197, "current": 1240},
        },
        seed=37,
        trials=3,
    )
    result = diag.compute_diagnostics(samples)

    vel_comp = next((c for c in result.side_comparisons if c.metric == "velocity_deficit_pct"), None)
    cur_comp = next((c for c in result.side_comparisons if c.metric == "steady_current_ma"), None)
    assert vel_comp is None  # genuinely unavailable without commanded data
    assert cur_comp is not None
    assert cur_comp.mean_diff > 0  # right side draws more current

    findings_by_label = {f.label: f for f in result.motor_findings}
    assert findings_by_label["front_right"].classification in ("High Resistance", "Possible High Resistance")


def test_overall_summary_generic_when_no_side_data_but_normal():
    samples = build_uncommanded_run(
        {"intake": {"velocity": 500, "current": 800}, "arm": {"velocity": 500, "current": 800}}, seed=41
    )
    result = diag.compute_diagnostics(samples)

    assert result.overall_classification == "normal"
    assert "drivetrain" not in result.overall_summary.lower()
