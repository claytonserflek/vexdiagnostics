from app import compare as compare_mod
from app import diagnostics as diag

from .helpers import build_run


def test_compare_shows_improvement_after_reducing_resistance():
    before_samples = build_run({"FL": 0.02, "BL": 0.02, "FR": 0.45, "BR": 0.35}, seed=21)
    after_samples = build_run({"FL": 0.03, "BL": 0.03, "FR": 0.08, "BR": 0.06}, seed=22)

    before = diag.compute_diagnostics(before_samples)
    after = diag.compute_diagnostics(after_samples)

    result = compare_mod.compare_tests(
        before,
        after,
        before_meta={"commanded_cruise_rpm": 200},
        after_meta={"commanded_cruise_rpm": 200},
    )

    assert result.warnings == []
    assert result.side_asymmetry_before_pts is not None
    assert result.side_asymmetry_after_pts is not None
    assert result.side_asymmetry_after_pts < result.side_asymmetry_before_pts
    assert result.side_asymmetry_change_pct < 0

    fr = next(m for m in result.motor_comparisons if m.label == "FR")
    assert fr.current_change_pct < 0  # current draw dropped after the fix


def test_compare_warns_on_different_commanded_rpm():
    samples = build_run({"FL": 0.02, "FR": 0.02, "BL": 0.02, "BR": 0.02}, seed=23)
    result_a = diag.compute_diagnostics(samples)
    result_b = diag.compute_diagnostics(samples)

    result = compare_mod.compare_tests(
        result_a,
        result_b,
        before_meta={"commanded_cruise_rpm": 200},
        after_meta={"commanded_cruise_rpm": 300},
    )
    assert any("different commanded cruise velocities" in w for w in result.warnings)


def test_compare_warns_on_mismatched_motor_labels():
    before_samples = build_run({"FL": 0.02, "FR": 0.02}, seed=25)
    after_samples = build_run({"FL": 0.02, "FR": 0.02, "BR": 0.02}, seed=26)

    before = diag.compute_diagnostics(before_samples)
    after = diag.compute_diagnostics(after_samples)

    result = compare_mod.compare_tests(before, after, before_meta={}, after_meta={})
    assert any("different motor labels" in w for w in result.warnings)
    assert {m.label for m in result.motor_comparisons} == {"FL", "FR"}
