"""Parsing and validation for the telemetry CSV format.

See docs/telemetry-csv-schema.md for the authoritative schema this module
implements. Validation errors are raised as CsvValidationError with a
human-readable message so a team can fix their export and re-import,
rather than surfacing a stack trace.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from typing import Optional

REQUIRED_COLUMNS = [
    "timestamp_ms",
    "motor_label",
    "commanded_velocity_rpm",
    "actual_velocity_rpm",
    "current_ma",
    "voltage_mv",
    "power_w",
    "torque_nm",
    "temperature_c",
    "position_deg",
    "trial",
]

REQUIRED_META = ["schema_version", "test_type", "test_name", "motors"]
# "timestamp" is intentionally NOT required: the V5 Brain has no onboard
# real-time clock, so firmware cannot reliably stamp a wall-clock time. When
# absent, the app falls back to import time (see Test.imported_at) for
# sorting/display and says so rather than pretending to know when the test
# was actually run.

_OPTIONAL_NUMERIC_COLUMNS = {
    "current_ma",
    "voltage_mv",
    "power_w",
    "torque_nm",
    "temperature_c",
    "position_deg",
}


class CsvValidationError(ValueError):
    pass


@dataclass
class ParsedTest:
    meta: dict
    rows: list = field(default_factory=list)


def parse_motors(motors_str: str) -> dict:
    motors: dict = {}
    if not motors_str:
        return motors
    for pair in motors_str.split(","):
        pair = pair.strip()
        if not pair:
            continue
        label, _, port = pair.partition(":")
        label = label.strip()
        port = port.strip()
        motors[label] = int(port) if port.isdigit() else port
    return motors


def _split_metadata_and_data(text: str) -> tuple:
    meta: dict = {}
    data_lines: list = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            content = stripped[1:].strip()
            if "=" in content:
                key, _, value = content.partition("=")
                meta[key.strip()] = value.strip()
        else:
            data_lines.append(line)
    return meta, data_lines


def _to_optional_float(value: Optional[str]) -> Optional[float]:
    if value is None or value == "":
        return None
    return float(value)


def _build_typed_rows(raw_rows: list, known_labels: set) -> list:
    rows = []
    seen_keys = set()
    for i, row in enumerate(raw_rows):
        line_no = i + 2  # +1 for header, +1 for 1-indexing
        try:
            timestamp_ms = int(float(row["timestamp_ms"]))
            trial = int(float(row["trial"]))
            motor_label = (row["motor_label"] or "").strip()
        except (KeyError, ValueError, TypeError) as exc:
            raise CsvValidationError(
                f"Row {line_no}: invalid timestamp_ms/trial/motor_label ({exc})"
            ) from exc

        if not motor_label:
            raise CsvValidationError(f"Row {line_no}: motor_label is empty")
        if known_labels and motor_label not in known_labels:
            raise CsvValidationError(
                f"Row {line_no}: motor_label '{motor_label}' is not declared in the '# motors=' metadata"
            )

        key = (trial, timestamp_ms, motor_label)
        if key in seen_keys:
            raise CsvValidationError(
                f"Row {line_no}: duplicate sample for trial={trial}, timestamp_ms={timestamp_ms}, "
                f"motor_label={motor_label}"
            )
        seen_keys.add(key)

        try:
            commanded = float(row["commanded_velocity_rpm"])
            actual = float(row["actual_velocity_rpm"])
            optional_values = {
                col: _to_optional_float(row.get(col)) for col in _OPTIONAL_NUMERIC_COLUMNS
            }
        except ValueError as exc:
            raise CsvValidationError(f"Row {line_no}: {exc}") from exc

        rows.append(
            {
                "timestamp_ms": timestamp_ms,
                "motor_label": motor_label,
                "commanded_velocity_rpm": commanded,
                "actual_velocity_rpm": actual,
                "trial": trial,
                **optional_values,
            }
        )
    return rows


def parse_csv_text(text: str) -> ParsedTest:
    meta, data_lines = _split_metadata_and_data(text)

    missing_meta = [k for k in REQUIRED_META if k not in meta]
    if missing_meta:
        raise CsvValidationError(
            f"CSV metadata is missing required key(s): {', '.join(missing_meta)}"
        )

    if not data_lines:
        raise CsvValidationError("CSV has no data rows after the metadata lines.")

    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))
    fieldnames = reader.fieldnames or []
    missing_columns = [c for c in REQUIRED_COLUMNS if c not in fieldnames]
    if missing_columns:
        raise CsvValidationError(
            f"CSV data table is missing required column(s): {', '.join(missing_columns)}"
        )

    raw_rows = list(reader)
    if not raw_rows:
        raise CsvValidationError("CSV has a header row but no telemetry data rows.")

    motors = parse_motors(meta.get("motors", ""))
    rows = _build_typed_rows(raw_rows, set(motors.keys()))

    return ParsedTest(meta=meta, rows=rows)
