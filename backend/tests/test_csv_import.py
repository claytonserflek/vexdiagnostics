import pytest

from app import csv_import

VALID_CSV = """# schema_version=1
# test_type=drivetrain_resistance_v1
# test_name=Unit test run
# timestamp=2026-08-30T14:32:00Z
# robot_name=1234A
# commanded_cruise_rpm=200
# trial_count=1
# motors=L:1,R:2
# notes=test fixture
timestamp_ms,motor_label,commanded_velocity_rpm,actual_velocity_rpm,current_ma,voltage_mv,power_w,torque_nm,temperature_c,position_deg,trial
0,L,0,0,80,12500,0,0,24,0,1
0,R,0,0,82,12500,0,0,24,0,1
20,L,200,150,900,12400,1.1,0.1,24.1,3,1
20,R,200,140,1200,12300,1.4,0.13,24.2,2.8,1
"""

# The exact example from the feature request: no metadata at all, generic
# column names, time in seconds, current in amps, voltage in volts.
GENERIC_CSV = """timestamp,motor_name,velocity_rpm,current_amp,voltage_v,temperature_c,torque_nm
0.0,front_left,198,1.21,11.92,31.2,0.18
0.0,back_left,201,1.18,11.94,30.8,0.17
0.0,front_right,164,2.08,11.71,35.4,0.31
0.0,back_right,197,1.24,11.90,31.5,0.18
"""


def test_parse_valid_csv():
    parsed = csv_import.parse_csv_text(VALID_CSV)
    assert parsed.meta["test_name"] == "Unit test run"
    assert parsed.meta["schema_version"] == "1"
    assert len(parsed.rows) == 4
    assert parsed.rows[0]["motor_label"] == "L"
    assert parsed.rows[2]["commanded_velocity_rpm"] == 200.0


def test_parse_motors():
    assert csv_import.parse_motors("FL:11,FR:12,BL:13,BR:14") == {
        "FL": 11,
        "FR": 12,
        "BL": 13,
        "BR": 14,
    }
    assert csv_import.parse_motors("") == {}


def test_missing_metadata_is_optional_and_auto_detects_motors():
    text = VALID_CSV.replace("# motors=L:1,R:2\n", "")
    parsed = csv_import.parse_csv_text(text)
    assert parsed.meta.get("motors") == "L,R"
    assert len(parsed.rows) == 4


def test_missing_all_metadata_still_imports():
    lines = [line for line in VALID_CSV.splitlines() if not line.startswith("#")]
    text = "\n".join(lines)
    parsed = csv_import.parse_csv_text(text)
    assert "schema_version" not in parsed.meta
    assert "test_name" not in parsed.meta
    assert parsed.meta["motors"] == "L,R"
    assert len(parsed.rows) == 4


def test_missing_optional_column_current_ma_is_fine():
    text = VALID_CSV.replace("current_ma,", "")
    parsed = csv_import.parse_csv_text(text)
    assert len(parsed.rows) == 4
    assert all(row["current_ma"] is None for row in parsed.rows)


def test_missing_required_velocity_column_raises():
    text = VALID_CSV.replace("actual_velocity_rpm,", "")
    with pytest.raises(csv_import.CsvValidationError, match="velocity"):
        csv_import.parse_csv_text(text)


def test_missing_required_time_column_raises():
    text = VALID_CSV.replace("timestamp_ms,", "")
    with pytest.raises(csv_import.CsvValidationError, match="time"):
        csv_import.parse_csv_text(text)


def test_missing_required_motor_column_raises():
    text = VALID_CSV.replace("motor_label,", "")
    with pytest.raises(csv_import.CsvValidationError, match="motor name"):
        csv_import.parse_csv_text(text)


def test_unknown_motor_label_raises():
    text = VALID_CSV.replace("0,L,0,0,80,12500,0,0,24,0,1", "0,X,0,0,80,12500,0,0,24,0,1")
    with pytest.raises(csv_import.CsvValidationError, match="not declared"):
        csv_import.parse_csv_text(text)


def test_duplicate_sample_raises():
    text = VALID_CSV + "0,L,0,0,80,12500,0,0,24,0,1\n"
    with pytest.raises(csv_import.CsvValidationError, match="duplicate"):
        csv_import.parse_csv_text(text)


def test_no_data_rows_raises():
    text = "\n".join(line for line in VALID_CSV.splitlines() if line.startswith("#"))
    with pytest.raises(csv_import.CsvValidationError, match="no data rows"):
        csv_import.parse_csv_text(text)


def test_optional_numeric_blank_is_none():
    text = VALID_CSV.replace("0,L,0,0,80,12500,0,0,24,0,1", "0,L,0,0,,12500,0,0,24,0,1")
    parsed = csv_import.parse_csv_text(text)
    row = next(r for r in parsed.rows if r["motor_label"] == "L" and r["timestamp_ms"] == 0)
    assert row["current_ma"] is None


# ---------------------------------------------------------------------------
# Generic, metadata-free CSVs (the actual feature request)
# ---------------------------------------------------------------------------


def test_generic_csv_with_no_metadata_imports_successfully():
    parsed = csv_import.parse_csv_text(GENERIC_CSV)
    assert len(parsed.rows) == 4
    labels = {r["motor_label"] for r in parsed.rows}
    assert labels == {"front_left", "back_left", "front_right", "back_right"}
    assert parsed.meta["motors"] == "back_left,back_right,front_left,front_right"


def test_generic_csv_converts_units_correctly():
    parsed = csv_import.parse_csv_text(GENERIC_CSV)
    row = next(r for r in parsed.rows if r["motor_label"] == "front_right")
    assert row["timestamp_ms"] == 0
    assert row["current_ma"] == pytest.approx(2080.0)
    assert row["voltage_mv"] == pytest.approx(11710.0)
    assert row["commanded_velocity_rpm"] is None
    assert row["actual_velocity_rpm"] == 164.0
    assert row["torque_nm"] == pytest.approx(0.31)
    assert row["position_deg"] is None


def test_amp_to_ma_conversion():
    text = (
        "time,motor,rpm,current_a\n"
        "0,m,100,1.5\n"
    )
    parsed = csv_import.parse_csv_text(text)
    assert parsed.rows[0]["current_ma"] == pytest.approx(1500.0)


def test_volt_to_mv_conversion():
    text = (
        "time,motor,rpm,volts\n"
        "0,m,100,12.4\n"
    )
    parsed = csv_import.parse_csv_text(text)
    assert parsed.rows[0]["voltage_mv"] == pytest.approx(12400.0)


def test_seconds_to_ms_conversion():
    text = (
        "time,motor,rpm\n"
        "0.5,m,100\n"
        "1.25,m,100\n"
    )
    parsed = csv_import.parse_csv_text(text)
    timestamps = sorted(r["timestamp_ms"] for r in parsed.rows)
    assert timestamps == [500, 1250]


def test_arbitrary_mechanism_motor_names():
    text = (
        "time_ms,motor_name,actual_rpm,current_amp\n"
        "0,intake,500,1.0\n"
        "0,arm,50,0.8\n"
        "0,claw,10,0.3\n"
    )
    parsed = csv_import.parse_csv_text(text)
    labels = {r["motor_label"] for r in parsed.rows}
    assert labels == {"intake", "arm", "claw"}


def test_single_motor_csv():
    text = "time,motor,rpm\n0,flywheel,3000\n20,flywheel,3000\n"
    parsed = csv_import.parse_csv_text(text)
    assert {r["motor_label"] for r in parsed.rows} == {"flywheel"}


def test_two_motor_csv():
    text = "time,motor,rpm\n0,left,100\n0,right,100\n"
    parsed = csv_import.parse_csv_text(text)
    assert {r["motor_label"] for r in parsed.rows} == {"left", "right"}


def test_more_than_four_motors():
    header = "time,motor,rpm\n"
    rows = "".join(f"0,m{i},100\n" for i in range(6))
    parsed = csv_import.parse_csv_text(header + rows)
    assert {r["motor_label"] for r in parsed.rows} == {f"m{i}" for i in range(6)}


def test_missing_optional_columns_default_to_none_or_trial_one():
    text = "time,motor,rpm\n0,m,100\n"
    parsed = csv_import.parse_csv_text(text)
    row = parsed.rows[0]
    assert row["trial"] == 1
    for col in ("commanded_velocity_rpm", "current_ma", "voltage_mv", "power_w", "torque_nm", "temperature_c", "position_deg"):
        assert row[col] is None


def test_missing_commanded_rpm_still_imports():
    text = "time,motor,rpm,current_a\n0,m,100,1.0\n20,m,101,1.0\n"
    parsed = csv_import.parse_csv_text(text)
    assert all(r["commanded_velocity_rpm"] is None for r in parsed.rows)
    assert all(r["actual_velocity_rpm"] is not None for r in parsed.rows)
