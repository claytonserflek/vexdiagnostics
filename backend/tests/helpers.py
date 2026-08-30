"""Shared helpers for building synthetic telemetry for tests.

This mirrors the (much larger) sample-data generator at
scripts/generate_sample_data.py but is deliberately small/fast, since unit
tests should run in well under a second each.
"""

from __future__ import annotations

import math
import random

from app.diagnostics import TelemetrySample

PHASES = [
    (0, 200),
    (200, 800),
    (0, 200),
    (-200, 800),
    (0, 200),
]
SAMPLE_INTERVAL_MS = 20


def build_run(resistance_by_motor: dict, trials: int = 3, seed: int = 1, noise: float = 1.0) -> list:
    """Build a synthetic telemetry sample list for a drivetrain run.

    resistance_by_motor: {"FL": 0.0, "FR": 0.4, ...} -- 0 means no added
    resistance, larger values simulate more mechanical resistance (lower
    steady-state velocity, higher current, slower acceleration).
    """
    rng = random.Random(seed)
    samples: list = []

    for trial in range(1, trials + 1):
        for label, r in resistance_by_motor.items():
            t = 0
            tau_ms = 200 + 700 * r
            for commanded, duration in PHASES:
                phase_start = t
                phase_end = t + duration
                while t < phase_end:
                    dt = t - phase_start
                    target = commanded * (1 - 0.01 - 0.16 * r)
                    alpha = 1 - math.exp(-dt / tau_ms) if tau_ms > 0 else 1.0
                    actual = target * alpha
                    actual += rng.gauss(0, noise)

                    base_current = 90 + 3.6 * abs(commanded)
                    resistance_current = 950 * r * (1 if abs(commanded) > 1 else 0.15)
                    current = max(0.0, base_current + resistance_current + rng.gauss(0, 20 * noise))

                    samples.append(
                        TelemetrySample(
                            timestamp_ms=t,
                            motor_label=label,
                            commanded_velocity_rpm=float(commanded),
                            actual_velocity_rpm=actual,
                            current_ma=current,
                            voltage_mv=12500 - 3.0 * current,
                            power_w=None,
                            torque_nm=None,
                            temperature_c=24.0 + 0.001 * r * t,
                            position_deg=None,
                            trial=trial,
                        )
                    )
                    t += SAMPLE_INTERVAL_MS
                t = phase_end
    return samples
