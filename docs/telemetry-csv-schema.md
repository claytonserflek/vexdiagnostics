# Telemetry CSV Schema (v1)

One CSV file per test run. This is the contract between the VEXcode
firmware (producer) and the backend importer (consumer) — either side can
be reimplemented independently as long as it honors this schema.

## File layout

Metadata lines start with `#` and appear before the data table. Order
does not matter; unknown `#` keys are ignored (forward compatible).
Required metadata keys:

```
# schema_version=1
# test_type=drivetrain_resistance_v1
# test_name=<free text>
# robot_name=<free text>
# commanded_cruise_rpm=200
# trial_count=3
# motors=FL:1,FR:2,BL:3,BR:4
```

- `motors` maps a logical position label to the V5 motor port number,
  comma-separated `label:port` pairs. Labels are free text but the
  diagnostics engine recognizes `L`/`R`-prefixed or `left`/`right`-prefixed
  labels (case-insensitive, e.g. `FL`, `FrontLeft`, `L1`) to build the
  left/right grouping; unrecognized labels are still imported and shown,
  just not used in left/right comparisons.

Optional metadata keys:

```
# timestamp=<ISO 8601, e.g. 2026-08-30T14:32:00Z>
# notes=<free text, e.g. "before adjustment" or what was changed>
# battery_pct=87
```

`timestamp` is optional because **the V5 Brain has no onboard real-time
clock** -- firmware cannot know the actual wall-clock date/time unless a
team manually hardcodes it per run (impractical mid-meeting) or a future
version derives it from a paired device. When absent, the app falls back
to the CSV's *import* time for sorting and display, and says so in the
UI, rather than fabricating a recorded time.

## Data table

After the metadata lines, a normal CSV header row followed by data rows,
**one row per motor per sample** (long format — this keeps the schema
independent of how many motors exist):

```
timestamp_ms,motor_label,commanded_velocity_rpm,actual_velocity_rpm,current_ma,voltage_mv,power_w,torque_nm,temperature_c,position_deg,trial
```

| Column | Type | Notes |
|---|---|---|
| `timestamp_ms` | integer | milliseconds since test start, shared across motors sampled together |
| `motor_label` | string | must match a label in the `# motors=` metadata |
| `commanded_velocity_rpm` | float | signed |
| `actual_velocity_rpm` | float | signed, from motor's velocity sensor |
| `current_ma` | float | unsigned magnitude |
| `voltage_mv` | float | |
| `power_w` | float | |
| `torque_nm` | float | |
| `temperature_c` | float | |
| `position_deg` | float | cumulative encoder position |
| `trial` | integer | 1-indexed trial number within the run |

Rows do not need to be sorted, but every `(timestamp_ms, motor_label)`
pair must be unique within a trial. Missing optional numeric fields may be
left blank; the importer treats a blank as "not recorded" rather than
zero, and the diagnostics engine skips indicators it lacks data for
(and says so in the output) rather than silently defaulting to zero.

## Example

```
# schema_version=1
# test_type=drivetrain_resistance_v1
# test_name=Baseline before gear adjustment
# timestamp=2026-08-30T14:32:00Z
# robot_name=1234A
# commanded_cruise_rpm=200
# trial_count=3
# motors=FL:11,FR:12,BL:13,BR:14
# notes=Robot elevated on foam blocks, battery 87%
timestamp_ms,motor_label,commanded_velocity_rpm,actual_velocity_rpm,current_ma,voltage_mv,power_w,torque_nm,temperature_c,position_deg,trial
0,FL,0,0,80,12600,0.0,0.0,24.0,0.0,1
0,FR,0,0,82,12600,0.0,0.0,24.0,0.0,1
20,FL,200,18,900,12500,0.11,0.06,24.0,0.4,1
20,FR,200,15,1400,12400,0.17,0.09,24.1,0.3,1
...
```

## Why long format, not one-column-per-motor

VEXcode logging code just appends one line per motor per sampling tick in
a loop — it never needs to know at compile time how many drivetrain
motors exist. The backend pivots to wide format internally for charting
and comparison, but the wire format stays simple and robot-agnostic.
