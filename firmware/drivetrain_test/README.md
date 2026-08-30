# Drivetrain Test Firmware

`src/main.cpp` runs the standardized drivetrain diagnostic test described
in `docs/test-protocol.md` and writes telemetry to the V5 Brain's SD card
in the format `docs/telemetry-csv-schema.md` defines.

## Honesty check before you rely on this

**This has not been compiled or run against a physical V5 Brain in the
environment this project was developed in** (no VEX hardware or VEXcode
toolchain available there). The code follows the general shape of the
VEXcode V5 Pro C++ API as documented publicly (`motor::spin`,
`motor::velocity`, `motor::current`, `brain::sdcard::savefile`, etc.), but
exact method names/signatures can differ slightly across VEXcode SDK
versions. Before trusting it on your robot:

1. Open it in VEXcode and let it flag any compile errors -- these are
   almost always just an API name mismatch for your installed VEXcode
   version, fixable by checking VEXcode's built-in API reference
   (Help menu) for the equivalent call.
2. Do a short dry run (1 short trial, robot elevated, nothing attached
   that could be damaged) before running the full profile on a
   competition robot.
3. Check the saved CSV opens cleanly and matches the schema before
   relying on it for a real diagnostic session.

## Setup

1. In VEXcode Pro, create a new **C++** project (not Blocks).
2. Use the device configuration screen to add your drivetrain motors on
   their actual ports -- or just declare them directly as this file does
   (simpler, keeps everything in one file for a single-purpose test
   program). If your team already has a `robot-config.cpp` from a
   competition project, either reuse those motor names in this file or
   copy this test into a fresh project to avoid clashing with your
   competition code.
3. Replace the contents of the generated `src/main.cpp` with this file's
   contents.
4. **Edit the motor block** near the top (`FL`, `FR`, `BL`, `BR`) to match
   your robot's actual ports, gear cartridges, and reversed flags.
5. Insert a microSD card into the Brain before running.
6. Elevate the robot so all drive wheels spin freely, then run the
   program from VEXcode (or a competition-style autonomous slot).
7. After it finishes, remove the SD card, copy
   `vex_diagnostics_drivetrain.csv` to a computer, and import it into the
   VEX Diagnostics app.

## Tuning

- `CRUISE_RPM`, `TRIAL_COUNT`, and the phase durations in `profile[]` are
  the knobs described in `docs/test-protocol.md`. Keep them identical
  between a "before" and "after" test pair.
- `SAMPLE_INTERVAL_MS` trades telemetry resolution against CSV file size
  and RAM used while building it in memory. 20ms (50Hz) is a reasonable
  default; V5 smart motors update their internal sensors around this
  rate, so sampling much faster mostly adds noise and file size.
- `testName`, `robotName`, and `notes` near the bottom of `main()` are
  currently hardcoded per build -- edit and re-download before each run,
  or extend this to prompt via `Controller1.Screen` / `Brain.Screen` if
  you want to set them without reflashing.

## Known limitations

- No onboard real-time clock -- the CSV intentionally omits a timestamp
  metadata line (see `docs/telemetry-csv-schema.md`); the app uses import
  time instead.
- The whole CSV is built in a single in-memory string and written once
  at the end. This keeps the SD card interaction simple but means a very
  long test (many more trials/motors/higher sample rate than the
  defaults) could use meaningful RAM. If you scale the test up
  significantly, consider writing per-trial instead.
- This firmware only exercises drivetrain motors, matching the MVP
  scope. Extending to other subsystems means adding another
  `DrivetrainMotor`-style array and giving it its own `test_type` in the
  metadata (the schema and backend diagnostics engine already treat
  "which motors are compared" as configuration, not something hardcoded
  to 4 motors).
