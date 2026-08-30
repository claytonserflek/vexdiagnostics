# Telemetry CSV Schema (v2 -- generic motor telemetry)

One CSV file per test run. This is the contract between whatever produced
the telemetry (VEXcode firmware, a PROS program, a spreadsheet export, a
hand-written script) and the backend importer -- either side can be
reimplemented independently as long as it honors this schema.

**This format works for telemetry from any VEX mechanism** -- drivetrain,
intake, lift, arm, flywheel, conveyor, whatever -- not only the
standardized drivetrain resistance test. The importer auto-detects
motors from the data itself and only asks for the columns that are
actually needed to say something useful; everything else is optional
metadata used when present.

## File layout

Metadata lines start with `#` and appear before the data table. Order
doesn't matter, and **every metadata key is optional**:

```
# schema_version=1
# test_type=drivetrain_resistance_v1
# test_name=<free text>
# robot_name=<free text>
# commanded_cruise_rpm=200
# trial_count=3
# motors=FL:1,FR:2,BL:3,BR:4
# timestamp=<ISO 8601, e.g. 2026-08-30T14:32:00Z>
# notes=<free text, e.g. "before adjustment" or what was changed>
# battery_pct=87
```

If a key is present, the app uses it. If it's absent, the app infers a
sensible default rather than rejecting the file:

- **`motors`** -- when absent, every distinct motor name found in the
  data rows is auto-detected and used. When present, it also acts as a
  guard rail: any row naming a motor not listed in `# motors=` is
  rejected as a likely typo. Labels are free text; the diagnostics
  engine recognizes `left`/`right` substrings or `L`/`R`-built position
  codes (`FL`, `BR`, `L`, `RF`, ...) to build a left/right drivetrain
  grouping. Unrecognized labels (`intake`, `arm`, `claw`, ...) are still
  imported and fully analyzed, just never forced into a left/right
  comparison.
- **`test_type`** -- when absent, set to `drivetrain_resistance_v1` if
  the detected motor names resolve to both a left and a right side,
  otherwise `motor_telemetry_v1`. Purely a display label; it never gates
  which diagnostics actually run for a given motor (see
  `docs/diagnostics-algorithm.md`).
- **`test_name`** -- falls back to the uploaded filename.
- **`timestamp`** -- absent because **the V5 Brain has no onboard
  real-time clock**; the app falls back to the CSV's *import* time for
  sorting/display and says so in the UI rather than fabricating a
  recorded time.
- **`commanded_cruise_rpm`**, **`trial_count`**, **`robot_name`**,
  **`notes`**, **`battery_pct`** -- simply left unset/null when absent.

## Data table

After the metadata lines, a normal CSV header row followed by data rows,
**one row per motor per sample** (long format -- keeps the schema
independent of how many motors exist).

### Minimum required columns

Only three things make a row analyzable at all:

| Canonical field | Recognized column names (case-insensitive) |
|---|---|
| a time value | `timestamp_ms`, `time_ms`, `timestamp`, `time_s`, `time` |
| a motor name | `motor_label`, `motor_name`, `motor`, `name` |
| actual velocity | `actual_velocity_rpm`, `velocity_rpm`, `actual_rpm`, `rpm` |

Everything else below is optional -- present under any of its aliases,
or left as `null`/defaulted if the column simply isn't in the file.

### All recognized columns and unit conversions

| Canonical field | Recognized column names | Unit conversion |
|---|---|---|
| `timestamp_ms` | `timestamp_ms`, `time_ms` | none (already ms) |
| `timestamp_ms` | `timestamp`, `time_s`, `time` | seconds → ms |
| `motor_label` | `motor_label`, `motor_name`, `motor`, `name` | none |
| `actual_velocity_rpm` | `actual_velocity_rpm`, `velocity_rpm`, `actual_rpm`, `rpm` | none |
| `commanded_velocity_rpm` | `commanded_velocity_rpm`, `target_velocity_rpm`, `target_rpm`, `command_rpm`, `commanded_rpm` | none |
| `current_ma` | `current_ma` | none (already mA) |
| `current_ma` | `current_amp`, `current_a`, `amps` | amps → mA |
| `voltage_mv` | `voltage_mv` | none (already mV) |
| `voltage_mv` | `voltage_v`, `volts` | volts → mV |
| `power_w` | `power_w`, `power` | none |
| `torque_nm` | `torque_nm`, `torque` | none |
| `temperature_c` | `temperature_c`, `temp_c`, `temperature` | none |
| `position_deg` | `position_deg`, `position_degrees`, `position` | none |
| `trial` | `trial`, `trial_number`, `run` | none; defaults to `1` if the column is absent entirely |

If a CSV happens to have two columns that alias to the same canonical
field, the first one (in header order) wins.

### Commanded velocity is genuinely optional

**No commanded/target speed column at all is a fully supported case, not
an error.** When it's missing, the app still imports the file and
computes current draw, temperature, and raw velocity comparisons -- it
just marks the diagnostics that specifically require a commanded speed
(steady-state velocity deficit, acceleration lag) as unavailable for
that motor rather than inventing a target. See
`docs/diagnostics-algorithm.md` for exactly what stays available.

Rows do not need to be sorted, but every `(trial, timestamp_ms,
motor_label)` triple must be unique. Missing optional numeric fields may
be left blank; the importer treats a blank as "not recorded" rather than
zero, and the diagnostics engine skips indicators it lacks data for (and
says so in the output) rather than silently defaulting to zero.

## Example: canonical drivetrain schema (fully specified)

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

## Example: generic CSV, no metadata at all

```
timestamp,motor_name,velocity_rpm,current_amp,voltage_v,temperature_c,torque_nm
0.0,front_left,198,1.21,11.92,31.2,0.18
0.0,back_left,201,1.18,11.94,30.8,0.17
0.0,front_right,164,2.08,11.71,35.4,0.31
0.0,back_right,197,1.24,11.90,31.5,0.18
```

No `#` lines, `time` in seconds, current in amps, voltage in volts, no
commanded/target column. This imports cleanly: the 4 motors are
auto-detected, units are converted (1.21 A → 1210 mA, 11.92 V → 11920
mV, 0.0 s → 0 ms), `front_left`/`back_left`/`front_right`/`back_right`
resolve to a left/right drivetrain layout, and the current-based
comparison alone is enough to flag `front_right` here (current draw
roughly 70% above its peers).

## Why long format, not one-column-per-motor

Logging code just appends one line per motor per sampling tick in a
loop -- it never needs to know at compile time how many motors exist.
The backend pivots to wide format internally for charting and
comparison, but the wire format stays simple and mechanism-agnostic.
