/*----------------------------------------------------------------------*/
/*  VEX Diagnostics -- Standardized Drivetrain Resistance Test          */
/*                                                                      */
/*  Runs the commanded velocity profile described in                   */
/*  docs/test-protocol.md against every drivetrain motor, logs full    */
/*  telemetry to the SD card as CSV, and stops. Import the resulting   */
/*  file into the VEX Diagnostics app.                                 */
/*                                                                      */
/*  IMPORTANT -- READ BEFORE RUNNING:                                  */
/*   - Elevate the robot so all drive wheels spin freely (no floor     */
/*     contact). See docs/test-protocol.md for why.                    */
/*   - Update the motor ports/labels below to match your robot.        */
/*   - This project has not been build-tested against a physical V5    */
/*     Brain in this environment (no VEX hardware/toolchain available  */
/*     here). Cross-check method names against the VEXcode V5 Pro API  */
/*     reference in VEXcode's Help menu before relying on it, and do a */
/*     short dry run first.                                            */
/*----------------------------------------------------------------------*/

#include "vex.h"

#include <string>

using namespace vex;

brain Brain;
controller Controller1;

// --------------------------------------------------------------------
// Motor configuration -- EDIT THIS to match your robot.
//
// Labels must follow the convention documented in
// docs/telemetry-csv-schema.md / docs/diagnostics-algorithm.md
// (infer_side): built only from the letters F/B/L/R (e.g. "FL", "BR",
// "L", "R"), or containing the word "left"/"right". Anything else is
// still imported but excluded from left/right comparisons.
//
// The boolean argument to motor() is "reversed" -- set it so that a
// positive commanded velocity drives the robot forward on every motor.
// --------------------------------------------------------------------
motor FL = motor(PORT11, gearSetting::ratio18_1, false);
motor FR = motor(PORT12, gearSetting::ratio18_1, true);
motor BL = motor(PORT13, gearSetting::ratio18_1, false);
motor BR = motor(PORT14, gearSetting::ratio18_1, true);

struct DrivetrainMotor {
  motor &m;
  const char *label;
};

DrivetrainMotor drivetrain[] = {
    {FL, "FL"},
    {FR, "FR"},
    {BL, "BL"},
    {BR, "BR"},
};
const int MOTOR_COUNT = sizeof(drivetrain) / sizeof(drivetrain[0]);

// --------------------------------------------------------------------
// Test parameters -- see docs/test-protocol.md for the rationale
// behind these defaults. Keep these identical between a "before" and
// "after" test so the comparison in the app is meaningful.
// --------------------------------------------------------------------
const double CRUISE_RPM = 200.0;
const int TRIAL_COUNT = 3;
const int SAMPLE_INTERVAL_MS = 20;

struct Phase {
  double commandedRpm;
  int durationMs;
};

Phase profile[] = {
    {0.0, 500},
    {CRUISE_RPM, 3000},
    {0.0, 1000},
    {-CRUISE_RPM, 3000},
    {0.0, 1000},
};
const int PHASE_COUNT = sizeof(profile) / sizeof(profile[0]);

// The whole CSV is built in memory and written once at the end, which
// keeps the SD card writes simple (a single savefile() call) and avoids
// depending on an incremental "append" API that may not exist on every
// VEXcode SDK version. A 3-trial, 4-motor, 20ms-interval run produces
// roughly 5,000-6,000 lines / 300-400KB of text, which is well within
// the V5 Brain's available RAM -- if you increase trial count, motor
// count, or sample rate substantially, watch for memory pressure and
// consider writing in per-trial chunks instead (appendfile(), if
// available in your SDK version).
std::string csvBuffer;

void writeMetadataHeader(const std::string &testName, const std::string &robotName,
                          const std::string &notes) {
  csvBuffer += "# schema_version=1\n";
  csvBuffer += "# test_type=drivetrain_resistance_v1\n";
  csvBuffer += "# test_name=" + testName + "\n";
  csvBuffer += "# robot_name=" + robotName + "\n";
  csvBuffer += "# commanded_cruise_rpm=" + std::to_string((int)CRUISE_RPM) + "\n";
  csvBuffer += "# trial_count=" + std::to_string(TRIAL_COUNT) + "\n";

  std::string motors;
  for (int i = 0; i < MOTOR_COUNT; i++) {
    if (i > 0) motors += ",";
    motors += drivetrain[i].label;
    motors += ":";
    motors += std::to_string(i + 1); // informational only; see NOTE below
  }
  csvBuffer += "# motors=" + motors + "\n";
  // NOTE: the port numbers above are just labels for the CSV, not read
  // back by anything -- the app only uses the label text (FL/FR/...) to
  // group motors. Feel free to put real port numbers in if useful for
  // your own reference when reading the raw file.

  if (!notes.empty()) {
    csvBuffer += "# notes=" + notes + "\n";
  }
  // No "# timestamp=" line: the V5 Brain has no onboard real-time clock,
  // so we don't fabricate one. The app falls back to CSV import time.

  csvBuffer +=
      "timestamp_ms,motor_label,commanded_velocity_rpm,actual_velocity_rpm,current_ma,"
      "voltage_mv,power_w,torque_nm,temperature_c,position_deg,trial\n";
}

void appendSample(int timestampMs, const char *label, double commandedRpm, motor &m, int trial) {
  csvBuffer += std::to_string(timestampMs);
  csvBuffer += ",";
  csvBuffer += label;
  csvBuffer += ",";
  csvBuffer += std::to_string(commandedRpm);
  csvBuffer += ",";
  csvBuffer += std::to_string(m.velocity(velocityUnits::rpm));
  csvBuffer += ",";
  csvBuffer += std::to_string(m.current(currentUnits::amp) * 1000.0);
  csvBuffer += ",";
  csvBuffer += std::to_string(m.voltage(voltageUnits::mV));
  csvBuffer += ",";
  csvBuffer += std::to_string(m.power(powerUnits::watt));
  csvBuffer += ",";
  csvBuffer += std::to_string(m.torque(torqueUnits::Nm));
  csvBuffer += ",";
  csvBuffer += std::to_string(m.temperature(temperatureUnits::celsius));
  csvBuffer += ",";
  csvBuffer += std::to_string(m.position(rotationUnits::deg));
  csvBuffer += ",";
  csvBuffer += std::to_string(trial);
  csvBuffer += "\n";
}

// Running timestamp offset so each phase's samples land at the correct
// absolute time within the trial (phase 0 starts at t=0).
int trialOffsetMs(int phaseIndex) {
  int offset = 0;
  for (int i = 0; i < phaseIndex; i++) {
    offset += profile[i].durationMs;
  }
  return offset;
}

void runTrial(int trial) {
  for (int p = 0; p < PHASE_COUNT; p++) {
    double commanded = profile[p].commandedRpm;
    for (int i = 0; i < MOTOR_COUNT; i++) {
      drivetrain[i].m.spin(directionType::fwd, commanded, velocityUnits::rpm);
    }

    int elapsed = 0;
    while (elapsed < profile[p].durationMs) {
      for (int i = 0; i < MOTOR_COUNT; i++) {
        appendSample(elapsed + trialOffsetMs(p), drivetrain[i].label, commanded, drivetrain[i].m, trial);
      }
      task::sleep(SAMPLE_INTERVAL_MS);
      elapsed += SAMPLE_INTERVAL_MS;
    }
  }

  for (int i = 0; i < MOTOR_COUNT; i++) {
    drivetrain[i].m.stop(brakeType::coast);
  }
}

int main() {
  Brain.Screen.clearScreen();
  Brain.Screen.print("VEX Diagnostics: Drivetrain Test");
  Brain.Screen.newLine();

  if (!Brain.SDcard.isInserted()) {
    Brain.Screen.print("No SD card inserted. Insert one and restart.");
    return 1;
  }

  // Reset encoders so position_deg is meaningful relative to test start.
  for (int i = 0; i < MOTOR_COUNT; i++) {
    drivetrain[i].m.setPosition(0, rotationUnits::deg);
  }

  // Edit these per run, or wire up controller/screen input if you want
  // to set them without reflashing code each time.
  std::string testName = "Drivetrain test";
  std::string robotName = "Robot";
  std::string notes = "Robot elevated, wheels off ground";

  writeMetadataHeader(testName, robotName, notes);

  Brain.Screen.print("Elevate robot. Running in 3s...");
  task::sleep(3000);

  for (int trial = 1; trial <= TRIAL_COUNT; trial++) {
    Brain.Screen.clearScreen();
    Brain.Screen.print("Trial %d / %d", trial, TRIAL_COUNT);
    runTrial(trial);
    task::sleep(300); // brief settle between trials
  }

  std::string filename = "vex_diagnostics_drivetrain.csv";
  int32_t written = Brain.SDcard.savefile(filename.c_str(), (uint8_t *)csvBuffer.c_str(), csvBuffer.length());

  Brain.Screen.clearScreen();
  if (written > 0) {
    Brain.Screen.print("Saved %s (%d bytes)", filename.c_str(), written);
  } else {
    Brain.Screen.print("SD card write failed (code %d)", written);
  }

  return 0;
}
