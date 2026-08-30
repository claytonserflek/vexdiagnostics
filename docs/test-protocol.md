# Standardized Drivetrain Diagnostic Test (v1)

## Setup

1. Elevate the robot so all drivetrain wheels spin freely with no floor
   contact (stands, foam blocks, or a stack of books under the chassis).
   This is required — the diagnostics compare motors against each other,
   and floor traction/turning scrub would swamp that comparison.
2. Battery should be reasonably charged (note the battery level in the
   test's notes field; large State-of-Charge swings between "before" and
   "after" runs can shift current/voltage readings independent of any
   mechanical change).
3. Let the robot sit idle for a few seconds before starting so starting
   temperature is consistent between runs.

## Motor grouping

Every drivetrain motor is labeled with a logical position, e.g. `FL`,
`FR`, `BL`, `BR` (front-left, front-right, back-left, back-right), or
just `L`/`R` for a 2-motor drivetrain. The diagnostics engine compares:

- **Left side vs. right side** (all left motors vs. all right motors)
- **Individual motor vs. its own side's group** (e.g. is `BR` an outlier
  even relative to the rest of the right side)

## Commanded motion profile

All drivetrain motors receive the **same commanded velocity at the same
time** (open-loop or velocity-controlled — velocity mode is preferred so
"commanded vs. actual" is a meaningful error signal). The default profile:

| Phase | Commanded velocity | Duration |
|---|---|---|
| 1. Settle | 0 RPM | 500 ms |
| 2. Ramp/step to cruise | 200 RPM | 3000 ms |
| 3. Hold (steady state) | 200 RPM | 2000 ms (part of phase 2's tail is used as steady state) |
| 4. Stop | 0 RPM | 1000 ms |
| 5. Reverse step | -200 RPM | 3000 ms |
| 6. Stop | 0 RPM | 1000 ms |

This is repeated for **3 trials** in the same run so noise vs. a
repeatable pattern can be distinguished (a one-off glitch in a single
trial is treated differently from a resistance signature that shows up in
all three).

200 RPM is a reasonable default cruise speed for most V5 drivetrains
(well under the ~600 RPM 6:1 cartridge no-load speed, and low enough that
current draw differences from mechanical resistance are visible, not
swamped by high-speed dynamic effects). Teams can change this value; it
is logged in the CSV metadata so it's never assumed by the analysis.

## Sampling

Telemetry for every drivetrain motor is sampled together at a fixed
interval (recommended **20 ms**, i.e. 50 Hz — V5 smart motors update
internally around this rate, so faster sampling mostly adds noise/file
size without new information). Each sample records, per motor:

- commanded velocity (RPM)
- actual velocity (RPM)
- current draw (mA)
- voltage (mV)
- power (W)
- torque (Nm)
- temperature (°C)
- position (degrees, cumulative)

## What "steady state" means for analysis

The last ~40% of each non-zero commanded-velocity phase is treated as
"steady state" — early samples during the ramp are dominated by
acceleration dynamics (inertia), not resistance, so steady-state current
and velocity error are the primary resistance indicators. The ramp
portion is still used, but only for the acceleration-lag indicator
(see `diagnostics-algorithm.md`).

## Between "before" and "after" tests

To make a before/after comparison valid:

- Use the same commanded profile (same cruise velocity, same durations).
- Keep the robot elevated the same way.
- Record what was physically changed on the robot in the test's notes
  field (e.g. "re-shimmed right center shaft, added 0.5mm spacer").
- Run immediately before and after the change, same battery if possible.

The app will warn (not block) if it detects the two tests being compared
used different commanded velocities or motor configurations, since that
makes a direct percentage comparison less meaningful.
