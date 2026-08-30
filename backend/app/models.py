from __future__ import annotations

import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Test(Base):
    """A single imported diagnostic test run.

    Diagnostics are intentionally NOT stored here -- they are recomputed
    on demand from the raw TelemetrySample rows via
    diagnostics.compute_diagnostics(). That keeps the stored record purely
    factual (what was measured) and means improvements to the diagnostics
    algorithm apply retroactively when a historical test is re-opened,
    rather than leaving old tests stuck with results from a stale version
    of the algorithm.
    """

    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    robot_name = Column(String, nullable=True)
    test_type = Column(String, nullable=False, default="motor_telemetry_v1")
    recorded_at = Column(DateTime, nullable=True)
    imported_at = Column(DateTime, default=datetime.datetime.utcnow)
    commanded_cruise_rpm = Column(Float, nullable=True)
    trial_count = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    battery_pct = Column(Float, nullable=True)
    motors_json = Column(Text, nullable=True)  # raw "label:port,label:port" string from CSV metadata
    source_filename = Column(String, nullable=True)

    samples = relationship("TelemetrySample", back_populates="test", cascade="all, delete-orphan")


class TelemetrySample(Base):
    __tablename__ = "telemetry_samples"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False, index=True)
    motor_label = Column(String, nullable=False, index=True)
    timestamp_ms = Column(Integer, nullable=False)
    commanded_velocity_rpm = Column(Float, nullable=True)
    actual_velocity_rpm = Column(Float, nullable=False)
    current_ma = Column(Float, nullable=True)
    voltage_mv = Column(Float, nullable=True)
    power_w = Column(Float, nullable=True)
    torque_nm = Column(Float, nullable=True)
    temperature_c = Column(Float, nullable=True)
    position_deg = Column(Float, nullable=True)
    trial = Column(Integer, nullable=False, default=1)

    test = relationship("Test", back_populates="samples")
