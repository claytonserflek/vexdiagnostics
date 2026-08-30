"""Parsing and validation for the telemetry CSV format.

See docs/telemetry-csv-schema.md for the authoritative schema this module
implements. Validation errors are raised as CsvValidationError with a
human-readable message so a team can fix their export and re-import,
rather than surfacing a stack trace.

This module supports telemetry from ANY VEX mechanism (drivetrain,
intake, lift, arm, flywheel, ...), not just the standardized drivetrain
test. Only three things are actually required to make a row meaningful:
a time value, a motor name, and its actual velocity. Everything else --
including all "# key=value" metadata lines -- is optional and either
used when present or inferred/left absent, never faked.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from typing import Optional

# ---------------------------------------------------------------------------
# Column aliases: map common header variants to this app's internal
# (canonical) field names, with a unit-conversion function when the alias
# implies a different unit than the canonical field.
# ---------------------------------------------------------------------------


def _seconds_to_ms(value: float) -> float:
    return value * 1000.0


def _amps_to_ma(value: float) -> float:
    return value * 1000.0


def _volts_to_mv(value: float) -> float:
    return value * 1000.0


# key: lowercased header text as it might appear in a real CSV.
# value: (canonical_field_name, converter_or_None)
COLUMN_ALIASES: dict = {
    "timestamp_ms": ("timestamp_ms", None),
    "time_ms": ("timestamp_ms", None),
    "timestamp": ("timestamp_ms", _seconds_to_ms),
    "time_s": ("timestamp_ms", _seconds_to_ms),
    "time": ("timestamp_ms", _seconds_to_ms),
    "motor_label": ("motor_label", None),
    "motor_name": ("motor_label", None),
    "motor": ("motor_label", None),
    "name": ("motor_label", None),
    "actual_velocity_rpm": ("actual_velocity_rpm", None),
    "velocity_rpm": ("actual_velocity_rpm", None),
    "actual_rpm": ("actual_velocity_rpm", None),
    "rpm": ("actual_velocity_rpm", None),
    "commanded_velocity_rpm": ("commanded_velocity_rpm", None),
    "target_velocity_rpm": ("commanded_velocity_rpm", None),
    "target_rpm": ("commanded_velocity_rpm", None),
    "command_rpm": ("commanded_velocity_rpm", None),
    "commanded_rpm": ("commanded_velocity_rpm", None),
    "current_ma": ("current_ma", None),
    "current_amp": ("current_ma", _amps_to_ma),
    "current_a": ("current_ma", _amps_to_ma),
    "amps": ("current_ma", _amps_to_ma),
    "voltage_mv": ("voltage_mv", None),
    "voltage_v": ("voltage_mv", _volts_to_mv),
    "volts": ("voltage_mv", _volts_to_mv),
    "power_w": ("power_w", None),
    "power": ("power_w", None),
    "torque_nm": ("torque_nm", None),
    "torque": ("torque_nm", None),
    "temperature_c": ("temperature_c", None),
    "temp_c": ("temperature_c", None),
    "temperature": ("temperature_c", None),
    "position_deg": ("position_deg", None),
    "position_degrees": ("position_deg", None),
    "position": ("position_deg", None),
    "trial": ("trial", None),
    "trial_number": ("trial", None),
    "run": ("trial", None),
}

# The only fields a row actually needs to be analyzable at all. Every other
# canonical field is optional -- present if the CSV has it (under any of
# its aliases), None/defaulted otherwise. See docs/telemetry-csv-schema.md.
REQUIRED_CANONICAL = ["timestamp_ms", "motor_label", "actual_velocity_rpm"]

_MISSING_FIELD_HINTS = {
    "timestamp_ms": "a time column (timestamp_ms, time_ms, timestamp, time_s, or time)",
    "motor_label": "a motor name column (motor_label, motor_name, motor, or name)",
    "actual_velocity_rpm": "a velocity/RPM column (actual_velocity_rpm, velocity_rpm, actual_rpm, or rpm)",
}

_OPTIONAL_NUMERIC_CANONICAL = (
    "commanded_velocity_rpm",
    "current_ma",
    "voltage_mv",
    "power_w",
    "torque_nm",
    "temperature_c",
    "position_deg",
)


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


def _resolve_column_map(fieldnames: list) -> dict:
    """Map each canonical field name to (source_column_name, converter) for
    whichever actual CSV column matches one of its known aliases.

    Matching is case-insensitive. If a CSV has more than one column that
    aliases to the same canonical field (unusual), the first one found
    wins and the rest are ignored.
    """
    resolved: dict = {}
    for actual in fieldnames:
        key = (actual or "").strip().lower()
        alias = COLUMN_ALIASES.get(key)
        if alias is None:
            continue
        canonical, converter = alias
        if canonical not in resolved:
            resolved[canonical] = (actual, converter)
    return resolved


def _get_value(row: dict, column_map: dict, canonical: str) -> Optional[float]:
    entry = column_map.get(canonical)
    if entry is None:
        return None
    actual_col, converter = entry
    raw = row.get(actual_col)
    if raw is None or raw == "":
        return None
    value = float(raw)
    return converter(value) if converter else value


def _build_typed_rows(raw_rows: list, column_map: dict, known_labels: set) -> list:
    rows = []
    seen_keys = set()
    label_column = column_map.get("motor_label")

    for i, row in enumerate(raw_rows):
        line_no = i + 2  # +1 for header, +1 for 1-indexing

        try:
            ts_value = _get_value(row, column_map, "timestamp_ms")
            if ts_value is None:
                raise ValueError("missing time value")
            timestamp_ms = int(round(ts_value))

            motor_label = (row.get(label_column[0]) if label_column else "") or ""
            motor_label = motor_label.strip()

            trial_value = _get_value(row, column_map, "trial")
            trial = int(round(trial_value)) if trial_value is not None else 1
        except (KeyError, ValueError, TypeError) as exc:
            raise CsvValidationError(f"Row {line_no}: invalid time/trial/motor value ({exc})") from exc

        if not motor_label:
            raise CsvValidationError(f"Row {line_no}: motor name is empty")
        if known_labels and motor_label not in known_labels:
            raise CsvValidationError(
                f"Row {line_no}: motor '{motor_label}' is not declared in the '# motors=' metadata"
            )

        key = (trial, timestamp_ms, motor_label)
        if key in seen_keys:
            raise CsvValidationError(
                f"Row {line_no}: duplicate sample for trial={trial}, timestamp_ms={timestamp_ms}, "
                f"motor={motor_label}"
            )
        seen_keys.add(key)

        try:
            actual = _get_value(row, column_map, "actual_velocity_rpm")
            if actual is None:
                raise ValueError("missing velocity value")
            optional_values = {col: _get_value(row, column_map, col) for col in _OPTIONAL_NUMERIC_CANONICAL}
        except ValueError as exc:
            raise CsvValidationError(f"Row {line_no}: {exc}") from exc

        rows.append(
            {
                "timestamp_ms": timestamp_ms,
                "motor_label": motor_label,
                "actual_velocity_rpm": actual,
                "trial": trial,
                **optional_values,
            }
        )
    return rows


def parse_csv_text(text: str) -> ParsedTest:
    meta, data_lines = _split_metadata_and_data(text)

    if not data_lines:
        raise CsvValidationError("CSV has no data rows.")

    reader = csv.DictReader(io.StringIO("\n".join(data_lines)))
    fieldnames = reader.fieldnames or []
    column_map = _resolve_column_map(fieldnames)

    missing_required = [c for c in REQUIRED_CANONICAL if c not in column_map]
    if missing_required:
        details = "; ".join(_MISSING_FIELD_HINTS[c] for c in missing_required)
        raise CsvValidationError(f"CSV is missing required column(s): {details}.")

    raw_rows = list(reader)
    if not raw_rows:
        raise CsvValidationError("CSV has a header row but no telemetry data rows.")

    declared_motors = parse_motors(meta["motors"]) if meta.get("motors") else None
    known_labels = set(declared_motors.keys()) if declared_motors else set()

    rows = _build_typed_rows(raw_rows, column_map, known_labels)

    if declared_motors is None:
        # No "# motors=" metadata -- auto-detect from whatever motor names
        # actually appear in the data, rather than requiring them declared
        # up front. Reuses the exact same "label:port" string format so
        # every downstream consumer (Test.motors_json, the API response,
        # the frontend) needs no changes to handle this case.
        detected_labels = sorted({r["motor_label"] for r in rows})
        meta = {**meta, "motors": ",".join(detected_labels)}

    return ParsedTest(meta=meta, rows=rows)
