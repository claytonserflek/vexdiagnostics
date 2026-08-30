# VEX Diagnostics

A diagnostic and troubleshooting tool for VEX V5 robotics teams. It turns
"the right side feels like it has more friction" into a quantitative,
repeatable test: run a standardized drivetrain test, get a per-motor
resistance estimate backed by actual telemetry and simple statistics,
make a mechanical change, and re-test to check whether it actually
helped.

This is the MVP: **drivetrain resistance diagnostics only**. See
`docs/architecture.md` for what's deliberately out of scope for now and
why.

## How it works, end to end

1. Run the standardized test on the robot (`firmware/drivetrain_test`) --
   elevated on stands, wheels spinning freely, same commanded velocity
   sent to every drivetrain motor. Telemetry is logged to the Brain's SD
   card as CSV.
2. Pull the SD card, import the CSV into the app.
3. The backend (deterministic math, no AI/ML) computes velocity/current
   comparisons between motors and between left/right sides, and flags
   where the evidence suggests elevated mechanical resistance.
4. The frontend shows a drivetrain resistance map, per-motor findings,
   raw velocity/current graphs, and lets you compare a "before" and
   "after" test to see whether a fix actually reduced the asymmetry.

Read `docs/architecture.md` first -- it explains why telemetry transfer
works this way (no live wireless link exists on stock V5 hardware) and
why the test runs with wheels off the ground. `docs/test-protocol.md` and
`docs/diagnostics-algorithm.md` are the full spec for the test and the
math; they're written to be reproducible by hand from a raw CSV, not just
"trust the app."

## Repository layout

```
docs/                        protocol, CSV schema, diagnostics algorithm writeups
firmware/drivetrain_test/    VEXcode Pro (C++) program for the robot
backend/                     FastAPI + SQLite service (import, diagnostics, history, compare)
frontend/                    React + Vite app (upload, history, charts, compare)
sample-data/                 synthetic before/after CSVs for trying the app without hardware
scripts/generate_sample_data.py   regenerates the files in sample-data/
```

## Running it locally

### Backend

```
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Run the test suite (deterministic, no hardware needed). This needs
`requirements-dev.txt` (pytest/httpx), which isn't installed in
production:

```
cd backend && source .venv/bin/activate && pip install -r requirements-dev.txt && python -m pytest
```

### Frontend

```
cd frontend
npm install
npm run dev
```

`npm run dev` automatically points the app at `http://localhost:8000`
via `.env.development` -- no setup needed. `.env.example` documents the
`VITE_API_BASE_URL` variable if you ever want to override it locally via
your own gitignored `.env.local`.

Open the printed local URL. Import `sample-data/baseline_test.csv` and
`sample-data/after_adjustment_test.csv` from the "Import Test" tab to try
the full flow (history, drivetrain map, charts, compare) without a robot.
Those two files were generated with a simulated right-side resistance
fault that's mostly fixed in the second file, so you should see a "High
Resistance" call on the baseline and a large improvement in the compare
view.

### On the robot

See `firmware/drivetrain_test/README.md` for how to set up and run the
actual test program, and read the honesty note at the top of that file
-- it hasn't been hardware-tested in the environment this was built in,
so budget time for a dry run and possible small API fixes against your
VEXcode version.

## Deploying to Render

`render.yaml` at the repo root defines two services (this is genuinely
two separate apps -- a Python API and a static frontend -- not one):

- `vex-diagnostics-api` -- the FastAPI backend, as a Python **Web
  Service**.
- `vex-diagnostics-app` -- the built frontend, as a **Static Site**.

Connect the repo in the Render dashboard as a Blueprint and it reads
`render.yaml` automatically. One thing worth checking after the first
deploy: the frontend's `VITE_API_BASE_URL` is pre-set in `render.yaml` to
the backend's *predicted* URL (`https://vex-diagnostics-api.onrender.com`,
derived from the service name). Render normally honors that exact name,
but if it's already taken by someone else's Render service globally, your
backend gets a different auto-generated URL instead. Compare the actual
backend URL in the Render dashboard against that value; if they differ,
update `VITE_API_BASE_URL` on the frontend service and redeploy it.

Also worth knowing: the backend stores test history in a SQLite file on
local disk. Render's free web services don't persist disk across deploys
or restarts, so **test history will reset** whenever the backend
redeploys or spins down from inactivity. That's fine for trying the app
out; for real season-long history you'd want either a paid Render plan
with a persistent Disk mounted at the SQLite path, or to swap in a
hosted Postgres database -- not done here since it's a real infra
decision, not something to default silently.

## Design principles this project follows

- **No AI/ML in the diagnostic path.** Every number the app reports is
  plain, documented arithmetic over telemetry (see
  `docs/diagnostics-algorithm.md`). Anyone can reproduce a result by hand
  from the raw CSV.
- **Say what's measured vs. estimated.** Current draw and velocity error
  are proxies for mechanical resistance, not direct measurements of it.
  The app's language reflects that everywhere -- "possible," "consistent
  with," "inspect," never "diagnosed" or "confirmed."
- **Honest about statistical power.** A 3-trial field test is small. The
  app reports p-values and calls out "weak evidence" as weak rather than
  dressing up a marginal result as confident.
- **No invented hardware capabilities.** No live wireless telemetry, no
  onboard real-time clock -- both are constraints of stock V5 hardware,
  documented in `docs/architecture.md` rather than papered over.
