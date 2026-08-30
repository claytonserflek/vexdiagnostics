# Diagnostics Algorithm (v2) — Mechanism-Agnostic Motor Diagnostics

This document is the full, explainable spec for how raw telemetry becomes
a "Normal / Possible High Resistance / High Resistance" call. Everything
here is deterministic arithmetic — no ML, no black box. If a team disputes
a result, this document (plus the raw CSV) is enough to reproduce it by
hand.

**This engine analyzes telemetry from any VEX mechanism** — drivetrain,
intake, lift, arm, flywheel, conveyor — not only a drivetrain. Two things
are genuine specializations rather than assumptions baked into the core
logic:

- **Left/right drivetrain comparison** (Step 3) only activates when motor
  labels actually resolve to left/right groups. A motor named `intake` or
  `arm` never enters it; it still gets full per-motor analysis (Steps 1,
  2, 4-6).
- **Commanded-speed diagnostics** (steady-state velocity deficit,
  acceleration lag) require commanded-velocity telemetry. When a motor
  has none — a very real case for a passively-logged mechanism with no
  target speed — this engine does not invent a target. It falls back to
  comparing that motor's raw velocity against comparable motors instead
  (Step 1b), and callers can tell which mode a motor was analyzed in via
  `MotorSummary.has_commanded_data`.

**Core honesty constraint: current draw and velocity error are not direct
measurements of friction.** They are electrical/kinematic side effects
that correlate with mechanical resistance but are also affected by
battery state, motor wear, and normal manufacturing variance between
motors. The engine reports *estimates* built from these proxies, always
labeled as such, never as a measured friction value.

## Step 1 — Per-trial, per-phase steady-state extraction

For each `(motor, trial, phase)` where phase is a non-zero commanded
segment (the "cruise forward" or "cruise reverse" step in the profile):

- **Steady-state window** = the last 40% of samples in that phase (skips
  acceleration transients).
- `velocity_deficit_pct` = `(|commanded_rpm| - |actual_rpm_mean|) / |commanded_rpm| * 100`
  averaged over the steady-state window.
- `steady_current_ma` = mean current over the steady-state window.
- `accel_lag_ms` = time from phase onset until `|actual_rpm|` first
  reaches 90% of `|commanded_rpm|` (uses the whole phase, not just the
  steady-state window). If it never reaches 90%, `accel_lag_ms` is set to
  the full phase duration and flagged as "did not reach target."

This produces, per motor, one sample per `(trial, phase)` — with the
default profile (3 trials × forward+reverse) that's **6 samples per
motor**. Small, but it's what a two-minute test on the field can produce;
the statistics below are chosen to be honest about that sample size
rather than pretend it's bigger.

## Step 1b — When there's no commanded speed

If a motor has no usable commanded-velocity data for a given trial (no
column at all, or it's zero throughout), there's nothing to segment into
phases. Rather than reporting nothing, the whole trial is treated as one
window:

- `steady_current_ma` = mean current over every sample in the trial.
- `raw_velocity_rpm` = mean of `|actual_rpm|` over every sample in the
  trial.
- `velocity_deficit_pct` and `accel_lag_ms` stay `None` — there's no
  target to compute a deficit or a lag against, and the engine does not
  substitute a guess.

This uses the same per-`(trial, phase)` bookkeeping as commanded mode
(with a single synthetic phase per trial), which is what lets Step 3's
current-based side comparison keep working even when the velocity-based
one can't.

## Step 2 — Per-motor summary

For each motor, compute mean and sample standard deviation across its 6
`(trial, phase)` samples for each of the three metrics above. The
standard deviation here is the motor's **own repeat-trial noise floor** —
used later to judge whether a difference is bigger than normal run-to-run
variation.

## Step 3 — Side-level comparison (primary result, statistically tested)

If motor labels map to left/right groups (see CSV schema). Velocity and
current are evaluated independently, and current does not require
commanded-speed data (Step 1b) — a drivetrain-named set of motors with no
commanded column at all still gets a real current-based side comparison,
even though the velocity-based one stays unavailable.

For each `(trial, phase)`, average `velocity_deficit_pct` across all left
motors to get one L value, and across all right motors to get one R
value (averaging across motors *before* comparing sides avoids treating
multiple motors on one side as independent samples — they aren't, they
share the same test event). Do the same for `steady_current_ma`. This
gives paired L/R sample lists of length 6 (trial×phase).

Run a **paired difference test** (paired because L and R come from the
same trial/phase, so they share trial-to-trial noise like battery sag):
- `diff_i = R_i - L_i` for each of the 6 samples.
- Report `mean_diff`, and a two-sided **one-sample t-test on `diff`**
  against zero (Student's t, df = 5). This is the standard, appropriate
  test for small paired samples — it does not need the population to be
  large, only the differences to be roughly symmetric, which repeated
  trials of the same physical test satisfy reasonably well.
- Because n=6 is small, treat `p < 0.10` (not the usual 0.05) as the
  significance bar — stated explicitly in the UI as "weak/limited
  statistical evidence" vs. `p < 0.05` shown as "strong evidence." This is
  an exploratory field diagnostic, not a peer-reviewed test, and the tool
  says so rather than implying false precision.

**Practical significance gate:** a statistically significant difference
is only reported as meaningful if it also clears a minimum real-world
size: `|mean_diff| >= 3` percentage points for velocity deficit, or
`>= 10%` relative difference for current. This stops the tool from
flagging a statistically "significant" but practically irrelevant 0.5%
difference just because trial-to-trial noise happened to be very low.

Side-level result buckets (velocity and current each evaluated, then
combined):
- **Both metrics agree in direction, pass significance + practical gates**
  → "High Resistance" on the side with worse values.
- **One metric passes both gates, or both pass significance but not the
  practical gate** → "Possible High Resistance."
- Otherwise → "No significant side asymmetry detected."

## Step 4 — Individual motor flag (heuristic, not a formal test)

With only 3–4 motors, there isn't enough independent data for a rigorous
per-motor test, so this step is explicitly labeled a **heuristic** in the
UI, distinct from the statistically-tested side-level result above. This
step applies to every motor in the test, not only drivetrain ones.

For each motor, compare its per-motor summary (Step 2) against the mean
of *all other* motors in the same run ("leave-one-out"):

- `current_gap_pct = (motor.steady_current_ma_mean - others_mean) / others_mean * 100`
- `accel_gap_ms = motor.accel_lag_ms_mean - others_mean`
- Velocity, depending on mode:
  - **Commanded mode**: `velocity_gap = motor.velocity_deficit_pct_mean - others_mean` (positive = more deficit = worse).
  - **Uncommanded mode** (Step 1b): no deficit exists, so instead compare
    raw velocity against *other uncommanded-mode motors only* (comparing
    a raw RPM to a commanded-mode motor's deficit percentage wouldn't be
    apples-to-apples): `velocity_gap_pct = (others_raw_velocity_mean - motor.raw_velocity_mean) / others_raw_velocity_mean * 100`
    (positive = this motor is slower than its peers = worse).

A metric only counts as "elevated" for that motor if the gap **exceeds
both**:
1. An absolute practical threshold (defaults: 5 pts velocity, 15%
   current, 150 ms acceleration lag), and
2. `2 x` that motor's own repeat-trial standard deviation from Step 2
   (i.e., the gap is bigger than the motor's normal run-to-run noise).

Classification per motor, requiring **corroboration across indicators**
(this is the key defensibility rule — one noisy metric alone should not
produce a confident flag):

| Elevated indicators | Result |
|---|---|
| Velocity **and** current both elevated | High Resistance |
| Exactly one of velocity/current elevated | Possible High Resistance |
| Only acceleration lag elevated (velocity & current normal) | Possible Mechanism Binding (worth checking for something intermittently catching, not steady resistance) |
| None elevated | Normal |

## Step 5 — Variability / intermittent-binding flag (secondary)

Compute each motor's coefficient of variation (`SD / mean`) of
steady-state current across its 6 samples. If a motor's CoV is more than
**2x** the median CoV across all motors in the run, add a "Irregular /
possible intermittent binding" note — high run-to-run inconsistency, as
opposed to Step 4's *consistent* offset, points at something intermittent
(a catch, a loose fastener) rather than steady friction.

## Step 6 — Temperature trend (secondary)

If temperature telemetry is present, compute `temp_end - temp_start` per
motor across the whole run. If one motor's rise is more than **1.5x** the
next-highest motor's rise, add an "Elevated heating relative to other
motors" note. Absolute temperature limits (e.g. approaching the motor's
thermal cutoff) are also flagged regardless of relative comparison, since
that's a safety-relevant observation on its own.

## Step 7 — Producing the human-readable result

The per-motor table (Normal / Possible High Resistance / High
Resistance / Possible Mechanism Binding / notes) and the side-level
statistical result are combined into a plain-language summary, e.g.:

> "Right drivetrain shows higher current draw and lower velocity than
> left under the same commanded speed (weak statistical evidence, p=0.07,
> consistent across all 3 trials). Front Right individually shows the
> largest gap. This pattern is consistent with — but does not confirm —
> increased mechanical resistance on the right side. Inspect shaft
> alignment, bearing friction, gear spacing, wheel contact, and frame
> alignment on that side."

For a mechanism with no left/right structure at all (an intake, an arm),
there's no side-level statistic to report, so the summary stays scoped to
what the per-motor heuristic actually found, e.g.:

> "Motor-to-motor comparison flags claw as showing a gap large enough,
> relative to comparable motors in this test, to be worth inspecting.
> Inspect mounting and fasteners, bearing condition, gear engagement, and
> belt/chain tension on the flagged motor(s)."

The wording always: (a) names the measured quantities, (b) states the
confidence level plainly (or says outright that no formal side-level test
was possible), (c) lists candidate causes as things to **inspect**, never
as a diagnosed fault, since telemetry alone cannot distinguish between
e.g. a bent shaft and over-tight gear mesh — both would produce the same
electrical signature.

## Known limitations (stated deliberately, not hidden)

- Small trial counts (default 3) mean the statistics have real
  uncertainty; the tool reports p-values and noise floors precisely so
  that uncertainty is visible rather than papered over.
- Cannot distinguish between different physical causes that produce the
  same telemetry signature (e.g. bent shaft vs. tight bearing vs. gear
  mesh interference) — it narrows to a *side* or *motor*, not a *part*.
- Battery state-of-charge and temperature drift between "before" and
  "after" tests are confounds the tool cannot fully control for; it can
  only flag when configuration differs (see `test-protocol.md`) and
  surface battery/notes metadata so a human can judge.
- All thresholds (5 pts velocity, 15% current, 2x SD, etc.) are
  reasonable defaults, not physical constants — they are defined as named
  constants in `backend/app/diagnostics.py` so they can be tuned as real
  field data accumulates.
- The per-motor leave-one-out comparison (Step 4) can be *diluted* when
  more than one motor on the same side is affected: a badly-affected
  motor pulls up the "other motors" mean that its less-affected neighbor
  is compared against, which can under-flag the neighbor (e.g. reduce it
  from "High Resistance" to "Possible"). The side-level paired test
  (Step 3) does not have this problem, since it compares whole sides
  against each other — which is why it, not the per-motor heuristic, is
  treated as the primary result.
- Without commanded-velocity data (Step 1b), velocity-based diagnostics
  (steady-state deficit, acceleration lag) are unavailable, not
  estimated — a motor logged with no target speed can still be flagged
  on current alone, but a genuinely slow-but-otherwise-normal-current
  motor could go unflagged in that mode where a full commanded-mode test
  would have caught it via the deficit metric.
- The leave-one-out comparison assumes the motors in one CSV are meant to
  be broadly comparable (the same kind of mechanism, run together). It
  does not detect or separate out multiple unrelated mechanisms mixed
  into a single import (e.g. a drivetrain motor and an intake motor in
  the same file) — the standardized workflow is one test, one mechanism,
  per CSV.
