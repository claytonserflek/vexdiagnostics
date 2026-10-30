# Skills Route Optimizer — Lesson 1: Architecture and Approach

This is the first of a series of lessons for building an autonomous-skills
route optimizer for V5RC **Override** (2026–2027). Each lesson builds one
component, explains how it works, and ends with something you can run and
test. This lesson builds nothing; it decides *what* to build and *why*.

The rest of this repo follows a rule: deterministic math you can check by
hand, no ML unless it earns its place. The optimizer follows the same rule.

---

## 1. What problem are we actually solving?

Strip away the robot and Autonomous Coding Skills looks like this:

> One robot, one minute, a known field. There's a list of things worth
> points (score a Pin in a Goal, set a Toggle, end in the Midfield). Each
> takes time to reach and time to do. Some only pay off if something else
> happened first. Choose the order that ends with the most points before
> time runs out.

Computer scientists have a name for this: the **Orienteering Problem**
(sometimes called the prize-collecting travelling salesman problem). Ours
also has:

- **Capacity**: the robot can carry only a few Pins at once, so it has to go
  pick them up before it can score.
- **Precedence and conditional rewards**: yellow Pin Halves score only if
  that Quadrant's Toggle is set right (see the rules ledger below), so the
  value of a scoring action depends on actions taken earlier.
- **A terminal reward**: ending in the Midfield is worth points, but only at
  the end, so the route must leave time to get there.
- **Uncertainty**: real robots miss grabs and drift.

The problem is fully known, deterministic, and single-agent: there's no
opponent in Skills, the field starts the same every time, and you know your
robot. That one fact drives the whole architecture.

---

## 2. Which algorithm? (A*, GA, or RL)

These three aren't really competitors. They solve different layers of the
problem.

| Algorithm | What it's good at | Where it fits here |
|---|---|---|
| **A\*** | Shortest path from point A to point B around obstacles | **Low level.** "How long does it take to drive from Loader to Goal 3 without hitting anything?" Run once per pair of locations. |
| **Search over sequences** (beam search, branch-and-bound) | Picking the best *order* of a few dozen high-level actions | **High level, primary choice.** It's exact or near-exact, and every decision it makes can be explained. |
| **Genetic algorithm / simulated annealing** | Big, messy search spaces where exact search is too slow | **High level, second choice.** Use it if the sequence search becomes too slow, or to tune continuous parameters such as speeds and approach angles. |
| **Reinforcement learning** | Problems where you *can't* write down the model, or the environment reacts to you | **Not recommended as the core.** See below. |

### Why not reinforcement learning?

RL learns a policy by trial and error, usually over millions of simulated
episodes. That's the right tool when you can't model the world, or when
there's an opponent. Neither applies here:

1. **We already have the model.** We know the field, the rules, and (after
   we measure it) the robot. Searching that model directly finds better
   routes faster than learning it from scratch.
2. **It's hard to explain.** A judge or a teammate can follow "this route
   scores 3 points more because it sets the Toggle before collecting
   yellow Pins." "The neural network decided" is much harder to defend.
3. **Sim-to-real gap.** RL is very good at exploiting simulator quirks the
   real robot doesn't have.
4. **Cost.** Training is slow and fiddly. Planning runs in seconds.

RL could be an optional *extension* later, for example comparing a learned
policy against the planner's routes. It shouldn't be the foundation.

### The recommended approach: a two-level planner plus a Monte Carlo check

```
           ┌───────────────────────────────────────────┐
 Level 2   │  SEQUENCE PLANNER (beam search → GA later)│  "what to do, in what order"
           │  state = (pos, time, held, toggles, scored)│
           └───────────────▲───────────────────────────┘
                           │ cost(action_i → action_j)
           ┌───────────────┴───────────────────────────┐
 Level 1   │  MOTION MODEL  (A* + time-parameterized)   │  "how long does each move take"
           │  field geometry + robot kinematics         │
           └───────────────▲───────────────────────────┘
                           │
           ┌───────────────┴───────────────────────────┐
 Check     │  MONTE CARLO SIMULATOR                     │  "how often does it really work"
           │  same route × 1000s of noisy runs          │
           └────────────────────────────────────────────┘
```

The "thousands of strategies" you want to test come from two places: the
planner's search, which evaluates huge numbers of candidate sequences, and
the Monte Carlo simulator, which replays the best candidates thousands of
times with realistic noise. **Ranking routes by expected score and
reliability, not best-case score**, is the part that makes this genuinely
useful to a team, and the part most worth showing a judge.

---

## 3. System architecture

```
route-optimizer/
  data/
    override_rules.yaml      # point values, time limit, counts — each with a source
    override_field.yaml      # element positions, from Appendix A of the manual
    robot_4330W.yaml         # measured: speed, accel, turn rate, capacity, action times
  optimizer/
    rules.py                 # Lesson 2: scoring function (pure, unit-tested)
    field.py                 # Lesson 3: geometry, obstacles, coordinate system
    robot.py                 # Lesson 4: kinematics, travel-time model
    motion.py                # Lesson 5: A* + path timing → travel-time matrix
    actions.py               # Lesson 6: macro-actions with preconditions/effects
    planner.py               # Lesson 7: beam search; Lesson 9: GA comparison
    montecarlo.py            # Lesson 8: noisy execution, expected score
    codegen.py               # Lesson 11: route → V5 C++ (PROS/LemLib or VEXcode)
  sim/
    viewer.py                # Lesson 10: pygame 2D replay and interactive editing
  tests/
```

Data flows one way: **YAML in → plan → simulate → render / generate code.**
Every module except `viewer.py` is pure Python with no graphics, so it's
testable and fast.

### The key abstraction: macro-actions

The planner never thinks about individual motor commands. It works with
**macro-actions**, each defined by:

- **preconditions**: e.g. `held_pins >= 1`, `robot near Goal G`
- **effects**: e.g. `held_pins -= 1`, `goal G gets one Pin`, `toggle T = red`
- **duration**: travel time (from Level 1) plus a measured action time

Example macro-actions: `CollectPin(location)`, `MatchLoad(loader)`,
`PlacePin(goal)`, `SetToggle(toggle, color)`, `ParkMidfield()`.

This is the same idea as STRIPS planning in classical AI. It keeps the
search small (dozens of actions instead of millions of positions), and each
action maps directly onto a function in your robot code. That mapping is
what makes code generation possible later.

---

## 4. Tools and libraries

All Python 3.11+. Install only what each lesson needs.

| Library | Used for | Lesson |
|---|---|---|
| `pyyaml` | Loading rules, field, and robot configs | 2 |
| `pytest` | Testing the scoring function against hand-worked examples | 2 |
| `numpy` | Vector math, travel-time matrices | 3 |
| `shapely` | Field geometry: obstacles, robot footprint collision checks | 3 |
| `heapq` (standard library) | Priority queue for A\* and beam search; we'll write A\* ourselves so you understand it | 5, 7 |
| `matplotlib` | Static plots of routes and score distributions | 7–8 |
| `pygame` | Interactive 2D simulator | 10 |
| `ortools` (optional) | Exact solver to check the beam search against | 9 |

You can skip PyTorch and other ML frameworks. You won't need them.

---

## 5. Rules ledger: what's verified, and what isn't yet

**Ground rule: no rule value goes into `override_rules.yaml` without a
citation to the current official manual or an official Q&A.** The manual is
revised during the season (v2.1 was released 2026-10-08, and v2.2 is
expected in December 2026), so each value also records the version it came
from.

Status as of this lesson. I couldn't open the official manual directly, so
these come from search-engine excerpts of the official pages and still need
to be checked against the full text:

| Item | Value | Source | Status |
|---|---|---|---|
| Field size | 12' × 12' | Manual v2.1 §2 | from official excerpt — confirm |
| Element counts | 56 Cups, 63 Pins, 9 Goals, 4 Toggles (at center of each wall), 4 Loaders | Manual v2.1 §2 | from official excerpt — confirm |
| Skills match length | 1 minute | Manual v2.1 §3 | from official excerpt — confirm |
| Scored red/blue Pin Half (Skills) | 5 points | Manual v2.1 §3 | from official excerpt — confirm |
| Scored yellow Pin Half (Skills) | 10 points, only if Owned | Manual v2.1 §3 | from official excerpt — confirm |
| Robot ending in Midfield (Skills) | 8 points | Manual v2.1 §3 | from official excerpt — confirm |
| Yellow ownership, Quadrant Goal (Skills) | Owned if that Quadrant's Toggle matches the Quadrant's color | Manual v2.1 §3 | from official excerpt — confirm |
| Pin Half visibility | Not visible if nested in a Goal or in the opaque half of a Cup | Manual v2.1 §2 | from official excerpt — confirm |
| Starting position (Skills) | Legal start in the Quadrant adjacent to the red Alliance Station | Manual v2.1 §3 | from official excerpt — confirm |
| Match loads (Skills) | Any time, only through red Alliance Loaders | Manual v2.1 §3 | from official excerpt — confirm |
| Skills Stop Time | Tiebreaker only; doesn't change score | Manual v2.1 §3 | from official excerpt — confirm |
| GPS field strip | Required for Autonomous Coding Skills | Manual v2.1 §3 | from official excerpt — confirm |
| Element positions/coordinates | — | Manual Appendix A / field drawings | **NOT YET OBTAINED** |
| Midfield geometry and Midfield Goal ownership in Skills | — | Manual §2/§3 | **NOT YET OBTAINED** |
| Toggle mechanics (set states, how it's flipped) | — | Manual §2 | **NOT YET OBTAINED** |
| Whether Cups score directly | — | Manual §2/§3 | **NOT YET OBTAINED** |
| Number of preloads/match loads in Skills | — | Manual §3 | **NOT YET OBTAINED** |
| Robot size and starting-size limits | — | Manual robot rules | **NOT YET OBTAINED** |
| Q&A 3150 (Starting Quadrant vs Toggle State in Skills) | — | Official Q&A | **NOT YET READ** |

The 12-point Autonomous Bonus is a head-to-head rule and doesn't apply to
Skills.

Primary sources to verify against:
- Manual v2.1 §2 (The Game): https://manuals.vex.com/v5/override/v2.1/game/
- Manual v2.1 §3 (Robot Skills): https://manuals.vex.com/v5/override/v2.1/skills/
- Appendix A (Field Overview): https://manuals.vex.com/v5/override/v2.1/appendix-a/
- Official Q&A: https://events.vex.com/V5RC/2026-2027/QA

---

## 6. Lesson roadmap

| # | Lesson | You'll learn | Deliverable |
|---|---|---|---|
| 1 | Architecture (this doc) | Problem framing, algorithm choice | This plan |
| 2 | Rules as code | Writing a pure scoring function and testing it against hand-scored field states | `rules.py` + tests |
| 3 | Field model | Coordinate systems, geometry, obstacles | `field.py`, a field plot |
| 4 | Robot model | Measuring your robot; trapezoidal velocity profiles | `robot_4330W.yaml`, `robot.py` |
| 5 | A\* and path timing | Graph search, heuristics, why A\* is optimal | Travel-time matrix |
| 6 | Macro-actions | State, preconditions, effects | `actions.py` |
| 7 | Beam search planner | Search trees, pruning, admissible bounds | First optimized route |
| 8 | Monte Carlo | Noise models, expected value vs. variance | Reliability-ranked routes |
| 9 | GA vs. beam search | Evolutionary search; a fair head-to-head comparison | A data-backed algorithm choice |
| 10 | 2D simulator | Game loop, rendering, replay | `pygame` viewer |
| 11 | Code generation | Templates; route → autonomous program | Generated V5 code |
| 12 | Closing the loop | Logging real runs, recalibrating the model | Sim-vs-real accuracy report |

Lesson 12 connects back to the rest of this repo: the same SD-card
telemetry pipeline used for diagnostics can measure how closely real runs
match the simulator. **That measured sim-to-real comparison is the strongest
evidence you can show for an Innovate Award**, because it proves the tool
works on your robot and not just on paper.

---

## 7. Before Lesson 2: your homework

1. **Get the official manual text.** Open §2, §3, and Appendix A of the
   current version and fill in every *NOT YET OBTAINED* row above with the
   value and rule number.
2. **Start an engineering notebook entry** for this project: the problem
   statement, why you chose search over RL, and the rules ledger. Judges
   look for this reasoning.
3. **Think about your robot's real capacity.** How many Pins can it hold at
   once? Roughly how many seconds does one pickup take? Guesses are fine for
   now; we'll measure properly in Lesson 4.
