#!/usr/bin/env python3
"""Generate synthetic drivetrain telemetry CSVs for demoing/testing VEX
Diagnostics without real robot hardware.

This is a simplified simulation, not a physics model of a VEX drivetrain.
It exists so the app can be exercised end-to-end (import -> diagnostics ->
charts -> compare) before a team has run the real test on a robot. Real
telemetry from a V5 Brain will look noisier and less clean than this.

Usage:
    python3 scripts/generate_sample_data.py
Writes sample-data/baseline_test.csv and sample-data/after_adjustment_test.csv.
"""

from __future__ import annotations

import math
import os
import random

MOTORS = {"FL": 11, "FR": 12, "BL": 13, "BR": 14}
SAMPLE_INTERVAL_MS = 20
CRUISE_RPM = 200
TRIAL_COUNT = 3

# Phase list: (commanded_rpm, duration_ms)
PHASES = [
    (0, 500),
    (CRUISE_RPM, 3000),
    (0, 1000),
    (-CRUISE_RPM, 3000),
    (0, 1000),
]


def simulate_motor_trial(commanded_profile, resistance_factor: float, rng: random.Random):
    """Return a list of (t_ms, commanded, actual, current_ma) for one trial."""
    samples = []
    t = 0
    actual = 0.0
    tau_ms = 250 + 900 * resistance_factor  # slower rise with more resistance
    for commanded, duration in commanded_profile:
        phase_start = t
        phase_end = t + duration
        while t < phase_end:
            dt = t - phase_start
            target = commanded * (1 - 0.015 - 0.16 * resistance_factor)
            # first-order approach toward the (slightly deficient) target
            alpha = 1 - math.exp(-dt / tau_ms) if tau_ms > 0 else 1.0
            actual = target * alpha if abs(commanded) > 1e-6 else actual * math.exp(-dt / 150.0)
            actual += rng.gauss(0, 1.4)  # sensor/control noise

            base_current = 90 + 3.6 * abs(commanded)
            resistance_current = 950 * resistance_factor * (1 if abs(commanded) > 1 else 0.15)
            current = base_current + resistance_current + rng.gauss(0, 25)
            current = max(0.0, current)

            samples.append((t, commanded, actual, current))
            t += SAMPLE_INTERVAL_MS
        t = phase_end
    return samples


def write_csv(path: str, test_name: str, notes: str, resistance_by_motor: dict, seed: int):
    rng = random.Random(seed)
    lines = []
    lines.append("# schema_version=1")
    lines.append("# test_type=drivetrain_resistance_v1")
    lines.append(f"# test_name={test_name}")
    lines.append("# timestamp=2026-08-30T14:32:00Z")
    lines.append("# robot_name=1234A")
    lines.append(f"# commanded_cruise_rpm={CRUISE_RPM}")
    lines.append(f"# trial_count={TRIAL_COUNT}")
    motors_str = ",".join(f"{label}:{port}" for label, port in MOTORS.items())
    lines.append(f"# motors={motors_str}")
    lines.append(f"# notes={notes}")
    lines.append("# battery_pct=87")
    lines.append(
        "timestamp_ms,motor_label,commanded_velocity_rpm,actual_velocity_rpm,current_ma,"
        "voltage_mv,power_w,torque_nm,temperature_c,position_deg,trial"
    )

    position = {label: 0.0 for label in MOTORS}
    temp = {label: 24.0 for label in MOTORS}

    for trial in range(1, TRIAL_COUNT + 1):
        motor_samples = {
            label: simulate_motor_trial(PHASES, resistance_by_motor.get(label, 0.0), rng)
            for label in MOTORS
        }
        n = len(next(iter(motor_samples.values())))
        for i in range(n):
            for label in MOTORS:
                t_ms, commanded, actual, current = motor_samples[label][i]
                position[label] += actual * (SAMPLE_INTERVAL_MS / 1000.0) * (360.0 / 60.0)
                temp[label] += 0.00025 * (1 + 2 * resistance_by_motor.get(label, 0.0)) * abs(commanded) / 200.0
                voltage_mv = 12500 - 3.0 * current
                power_w = (voltage_mv / 1000.0) * (current / 1000.0)
                torque_nm = 0.35 * (current / 1000.0)
                lines.append(
                    f"{t_ms},{label},{commanded:.1f},{actual:.2f},{current:.1f},"
                    f"{voltage_mv:.0f},{power_w:.3f},{torque_nm:.3f},{temp[label]:.2f},"
                    f"{position[label]:.1f},{trial}"
                )

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Wrote {path}")


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(repo_root, "sample-data")

    # Baseline: right side has noticeably more resistance than left.
    write_csv(
        os.path.join(out_dir, "baseline_test.csv"),
        test_name="Baseline before gear adjustment",
        notes="Robot elevated on foam blocks. Before adjusting right-side gear spacing.",
        resistance_by_motor={"FL": 0.03, "BL": 0.05, "FR": 0.42, "BR": 0.33},
        seed=42,
    )

    # After adjustment: right side resistance reduced substantially.
    write_csv(
        os.path.join(out_dir, "after_adjustment_test.csv"),
        test_name="After gear spacing adjustment",
        notes="Robot elevated on foam blocks. After re-spacing right-side gears and re-shimming BR shaft.",
        resistance_by_motor={"FL": 0.04, "BL": 0.04, "FR": 0.10, "BR": 0.08},
        seed=43,
    )


if __name__ == "__main__":
    main()
