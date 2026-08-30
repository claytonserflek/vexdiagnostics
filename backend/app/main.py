from __future__ import annotations

import dataclasses
import datetime
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import compare as compare_mod
from . import csv_import
from . import diagnostics as diag
from . import models
from .database import Base, engine, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="VEX Diagnostics API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_iso(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_optional_float(value: Optional[str]) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_optional_int(value: Optional[str]) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def _diag_samples_from_dicts(rows: list) -> list:
    return [diag.TelemetrySample(**row) for row in rows]


def _diag_samples_from_db(db: Session, test_id: int) -> list:
    db_rows = (
        db.query(models.TelemetrySample)
        .filter(models.TelemetrySample.test_id == test_id)
        .all()
    )
    return [
        diag.TelemetrySample(
            timestamp_ms=r.timestamp_ms,
            motor_label=r.motor_label,
            commanded_velocity_rpm=r.commanded_velocity_rpm,
            actual_velocity_rpm=r.actual_velocity_rpm,
            current_ma=r.current_ma,
            voltage_mv=r.voltage_mv,
            power_w=r.power_w,
            torque_nm=r.torque_nm,
            temperature_c=r.temperature_c,
            position_deg=r.position_deg,
            trial=r.trial,
        )
        for r in db_rows
    ]


def _test_meta_dict(test: models.Test) -> dict:
    return {
        "id": test.id,
        "name": test.name,
        "robot_name": test.robot_name,
        "test_type": test.test_type,
        "recorded_at": test.recorded_at.isoformat() if test.recorded_at else None,
        "imported_at": test.imported_at.isoformat() if test.imported_at else None,
        "commanded_cruise_rpm": test.commanded_cruise_rpm,
        "trial_count": test.trial_count,
        "notes": test.notes,
        "battery_pct": test.battery_pct,
        "motors": csv_import.parse_motors(test.motors_json or ""),
        "source_filename": test.source_filename,
    }


def _get_test_or_404(db: Session, test_id: int) -> models.Test:
    test = db.query(models.Test).filter(models.Test.id == test_id).first()
    if test is None:
        raise HTTPException(status_code=404, detail=f"Test {test_id} not found")
    return test


@app.post("/api/tests/import")
async def import_test(file: UploadFile = File(...), db: Session = Depends(get_db)):
    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"File is not valid UTF-8 text: {exc}")

    try:
        parsed = csv_import.parse_csv_text(text)
    except csv_import.CsvValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    meta = parsed.meta
    test = models.Test(
        name=meta.get("test_name") or file.filename or "Untitled test",
        robot_name=meta.get("robot_name"),
        test_type=meta.get("test_type", "drivetrain_resistance_v1"),
        recorded_at=_parse_iso(meta.get("timestamp")),
        commanded_cruise_rpm=_parse_optional_float(meta.get("commanded_cruise_rpm")),
        trial_count=_parse_optional_int(meta.get("trial_count")),
        notes=meta.get("notes"),
        battery_pct=_parse_optional_float(meta.get("battery_pct")),
        motors_json=meta.get("motors"),
        source_filename=file.filename,
    )
    db.add(test)
    db.flush()

    db_samples = [models.TelemetrySample(test_id=test.id, **row) for row in parsed.rows]
    db.bulk_save_objects(db_samples)
    db.commit()
    db.refresh(test)

    result = diag.compute_diagnostics(_diag_samples_from_dicts(parsed.rows))
    return {"test": _test_meta_dict(test), "diagnostics": dataclasses.asdict(result)}


@app.get("/api/tests")
def list_tests(db: Session = Depends(get_db)):
    tests = db.query(models.Test).order_by(models.Test.recorded_at.desc().nullslast(), models.Test.id.desc()).all()
    items = []
    for test in tests:
        samples = _diag_samples_from_db(db, test.id)
        result = diag.compute_diagnostics(samples)
        items.append(
            {
                **_test_meta_dict(test),
                "overall_classification": result.overall_classification,
                "overall_summary": result.overall_summary,
            }
        )
    return items


@app.get("/api/tests/compare")
def compare_tests_endpoint(before_id: int, after_id: int, db: Session = Depends(get_db)):
    before_test = _get_test_or_404(db, before_id)
    after_test = _get_test_or_404(db, after_id)

    before_samples = _diag_samples_from_db(db, before_id)
    after_samples = _diag_samples_from_db(db, after_id)

    before_result = diag.compute_diagnostics(before_samples)
    after_result = diag.compute_diagnostics(after_samples)

    before_meta = _test_meta_dict(before_test)
    after_meta = _test_meta_dict(after_test)

    comparison = compare_mod.compare_tests(before_result, after_result, before_meta, after_meta)

    return {
        "before": {"test": before_meta, "diagnostics": dataclasses.asdict(before_result)},
        "after": {"test": after_meta, "diagnostics": dataclasses.asdict(after_result)},
        "comparison": dataclasses.asdict(comparison),
    }


# NOTE: this must be registered *before* the `/api/tests/{test_id}` route below --
# FastAPI matches routes in registration order, and "compare" would otherwise be
# captured by the {test_id} path parameter (and fail int conversion).
@app.get("/api/tests/{test_id}")
def get_test(test_id: int, db: Session = Depends(get_db)):
    test = _get_test_or_404(db, test_id)
    samples = _diag_samples_from_db(db, test_id)
    result = diag.compute_diagnostics(samples)
    return {"test": _test_meta_dict(test), "diagnostics": dataclasses.asdict(result)}


@app.get("/api/tests/{test_id}/telemetry")
def get_telemetry(test_id: int, max_points_per_motor: int = 2000, db: Session = Depends(get_db)):
    _get_test_or_404(db, test_id)
    db_rows = (
        db.query(models.TelemetrySample)
        .filter(models.TelemetrySample.test_id == test_id)
        .order_by(models.TelemetrySample.trial, models.TelemetrySample.timestamp_ms)
        .all()
    )

    by_motor: dict = {}
    for r in db_rows:
        by_motor.setdefault(r.motor_label, []).append(r)

    series = {}
    for label, rows in by_motor.items():
        stride = max(1, len(rows) // max_points_per_motor)
        series[label] = [
            {
                "timestamp_ms": r.timestamp_ms,
                "trial": r.trial,
                "commanded_velocity_rpm": r.commanded_velocity_rpm,
                "actual_velocity_rpm": r.actual_velocity_rpm,
                "current_ma": r.current_ma,
                "temperature_c": r.temperature_c,
            }
            for r in rows[::stride]
        ]
    return series


@app.get("/api/health")
def health():
    return {"status": "ok"}
