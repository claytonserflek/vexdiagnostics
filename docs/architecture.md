# VEX Diagnostics — Architecture & Technical Constraints (MVP)

## What the V5 platform actually allows

The VEX V5 Brain does **not** expose a wireless telemetry API to third-party
software. There is no documented way for a laptop app to subscribe to live
motor data over Wi-Fi/Bluetooth without extra hardware. Two paths are
realistic with stock hardware:

1. **SD card export (chosen for MVP).** A VEXcode/PROS program can write to
   a file on the Brain's microSD card (`vex::brain::sdcard` in VEXcode Pro,
   or the `pros::usd` API in PROS). The team runs the test, removes the SD
   card, and imports the CSV into the app on a laptop. No cables, no
   drivers, no serial port quirks. The cost is a manual step (pull the
   card) and no live view during the run.
2. **USB-tethered live serial capture (deferred, not built yet).** The Brain
   can print lines over its USB connection while tethered; a receiver
   script on the laptop reads the serial port in real time. This gives a
   live view but adds per-OS serial driver issues, cable management during
   the test, and reconnect handling. The CSV schema below is
   transport-agnostic, so this can be added later as a second telemetry
   source without changing the backend or diagnostics engine.

**We are not building or claiming real-time wireless telemetry in this
version.** Any future "live dashboard" feature requires re-visiting this
constraint, not just UI work.

## Why the test is run with drive wheels off the ground

Motor telemetry during a floor-rolling test is confounded by carpet
texture, robot weight distribution, and turning scrub — none of which are
"mechanical resistance in the drivetrain" in the sense a team cares about
(bearings, shaft alignment, gear mesh, bent structure). The standardized
test (see `test-protocol.md`) is defined to run with the robot elevated on
stands so wheels spin freely. This isolates internal drivetrain resistance
from ground interaction, which is what makes the comparison across motors
meaningful. A secondary "on-ground straight line" test is described as an
optional future addition, not part of the MVP.

## Components

```
firmware/drivetrain_test/   VEXcode Pro (C++) program: runs the standardized
                             test, logs telemetry to SD card as CSV.

backend/                    FastAPI + SQLite service:
                               - import telemetry CSV, validate against schema
                               - deterministic diagnostics engine (pure Python,
                                 no ML/AI, fully unit tested)
                               - store test history
                               - compare two tests

frontend/                   React + Vite app:
                               - upload a CSV, see results
                               - per-motor telemetry charts, any mechanism
                               - drivetrain resistance visualization
                                 (shown only when motor names support it)
                               - test history list
                               - before/after comparison view

docs/                        protocol, schema, algorithm writeups (this folder)
```

## Explicit non-goals for v1

- No AI/ML in the diagnostic path. All scoring is deterministic arithmetic
  on telemetry, documented in `diagnostics-algorithm.md`, so results are
  reproducible and explainable to a judge or mentor.
- No live wireless telemetry.
- No claim of diagnosing exact root cause (e.g. "the bearing is worn") —
  only statistically/practically flagged abnormalities and a list of
  plausible mechanical causes to inspect, consistent with what current
  draw / velocity error can and cannot prove.
- The importer and diagnostics engine work on telemetry from any
  mechanism (drivetrain, intake, lift, arm, flywheel, ...), not only
  drivetrains -- see `telemetry-csv-schema.md` and
  `diagnostics-algorithm.md`. Left/right side comparison is a
  specialization that only activates when motor names support it; it is
  never assumed.
- One CSV is still assumed to represent one mechanism's test run. The
  engine does not attempt to separate multiple unrelated mechanisms
  mixed into a single import -- that stays a documented limitation, not
  a supported workflow.
