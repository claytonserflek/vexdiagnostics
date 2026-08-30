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


def test_missing_required_metadata_raises():
    text = VALID_CSV.replace("# motors=L:1,R:2\n", "")
    with pytest.raises(csv_import.CsvValidationError, match="motors"):
        csv_import.parse_csv_text(text)


def test_missing_required_column_raises():
    text = VALID_CSV.replace("current_ma,", "")
    with pytest.raises(csv_import.CsvValidationError, match="current_ma"):
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
