# Priority Escalation Cron

**File:** `src/lib/priority-escalation.ts`  
**Registered in:** `src/server.ts` — `startPriorityEscalation()`  
**Schedule:** Every day at **23:55 Cairo time** (`Africa/Cairo` timezone)

---

## Purpose

At the end of each day, this cron inspects each user's non-recurring active tasks and
determines whether their backlog has become dangerously pressured by low-priority work.
When it has, it promotes the most-pressured task up one priority level.

This is intentionally **conservative**: at most **one upgrade per user per night**.

---

## Eligibility Criteria

A task must meet **all** of the following to be considered:

| Field | Required value |
|---|---|
| `status` | `ACTIVE` |
| `recurrence` | `NONE` |
| `priority` | `NONE`, `THREE`, or `TWO` |
| `createdAt` | older than `MIN_AGE_DAYS` days |

> **Hard ceiling:** `IMMEDIATE` priority is never assigned by this cron. `ONE` is the highest
> a task can reach through escalation.

---

## The Two Knobs

Both constants live at the **top of the file** — the only values you should ever need to change:

```typescript
const ESCALATION_SENSITIVITY = 5;   // 1 (conservative) → 10 (aggressive)
const HARD_AGE_CAP_DAYS      = 60;  // unconditional escalation after this many days
```

### `ESCALATION_SENSITIVITY` — ratio aggressiveness

All other ratio parameters are **derived** from this single value at startup:

| Derived constant | Formula | S=1 | S=5 | S=10 |
|---|---|---|---|---|
| `ESCALATION_THRESHOLD` | `4.0 − (S × 0.3)` | 3.7 | 2.5 | 1.0 |
| `PRESSURE_FLOOR` | `2.0 − (S × 0.15)` | 1.85 | 1.25 | 0.50 |
| `AGE_WEIGHT_PER_DAY` | `S × 0.01` | 0.01 | 0.05 | 0.10 |
| `MIN_AGE_DAYS` | `14 − S` | 13 | 9 | 4 |

### `HARD_AGE_CAP_DAYS` — absolute age ceiling

Any eligible task older than this many days is promoted **unconditionally**, bypassing the ratio
check entirely. This catches the blind spot where all tasks are equally old and the ratio stays
near 1.0 indefinitely.

- Default: **60 days**
- Set higher to be more lenient, lower to be stricter
- Picks the **oldest** cap-eligible task first (by `createdAt`)

---

## Scoring Algorithm (Step by Step)

### Step 1 — Score each eligible task

Every eligible task gets a numeric **pressure score**:

```
score = sizeWeight × ageBonus

ageBonus    = 1 + (excessDays × AGE_WEIGHT_PER_DAY)
excessDays  = max(0, ageInDays − MIN_AGE_DAYS)
```

**Size weights** (fixed, unlikely to need changing):

| `size` | Weight |
|---|---|
| `SMALL` | 1.0 |
| `NORMAL` | 1.5 |
| `LARGE` | 2.5 |

**Example** — `LARGE` task, 21 days old, sensitivity = 5 (`MIN_AGE_DAYS` = 9, `AGE_WEIGHT_PER_DAY` = 0.05):
```
excessDays = 21 − 9 = 12
ageBonus   = 1 + (12 × 0.05) = 1.60
score      = 2.5 × 1.60 = 4.00
```

---

### Step 2 — Compute the pressure ratio (per user)

Tasks are split into two buckets:

- **Low bucket** (`NONE`, `THREE`) → sum of scores = `lowPressure`
- **High bucket** (`ONE`, `TWO`) → sum of scores = `highPressure`

```
ratio = lowPressure / (highPressure + PRESSURE_FLOOR)
```

`PRESSURE_FLOOR` prevents division-by-zero and dampens the ratio when there are very few
(or no) high-priority tasks.

---

### Step 3 — Decide whether to escalate

Two independent triggers are checked in order. **Only one promotion per user per night.**

#### Trigger A — Hard age cap (checked first)

```
if any eligible task age >= HARD_AGE_CAP_DAYS → promote the oldest one unconditionally
```

This fires regardless of the ratio. It exists to catch the case where all tasks are equally old
and the ratio stays near 1.0 even though the backlog is severely neglected.

#### Trigger B — Pressure ratio

```
if ratio >= ESCALATION_THRESHOLD → escalate via ratio logic
```

Only reached if no task hit the hard age cap.

---

### Step 4 — Pick what to escalate (ratio path only)

If the ratio triggers, the cron finds the task with the **highest score** in the **lowest
available tier** (prefers `NONE` over `THREE` over `TWO`):

```
Escalation ladder:
  NONE  → THREE
  THREE → TWO
  TWO   → ONE
```

Only **one task** is promoted per user per nightly run.

---

## Worked Example

| Task | Priority | Size | Age | Score |
|---|---|---|---|---|
| A | `NONE` | `LARGE` | 21 days | **4.00** |
| B | `NONE` | `SMALL` | 12 days | 1.15 |
| C | `THREE` | `NORMAL` | 10 days | 1.575 |
| D | `TWO` | `NORMAL` | 30 days | 3.225 |

*(Sensitivity = 5 → threshold = 2.5, floor = 1.25)*

```
lowPressure  = 4.00 + 1.15 + 1.575 = 6.725
highPressure = 3.225
ratio = 6.725 / (3.225 + 1.25) = 6.725 / 4.475 ≈ 1.50
```

**1.50 < 2.5** → no escalation fires tonight.

Remove task D (no `TWO` tasks exist):
```
ratio = 6.725 / (0 + 1.25) = 5.38   ≥ 2.5 → ESCALATE
```
Task **A** is promoted: `NONE → THREE` (highest score in the lowest tier).

---

## Logging

Each run emits structured console logs:

```
# Hard age cap path:
[priority-escalation] user=11  low=12.08  high=11.85  ratio=0.92  threshold=2.5
[priority-escalation] user=11  ⏰ HARD CAP hit — upgraded task#195 "Assemble Gamma speaker"  TWO → ONE  (age=147d)

# Ratio path:
[priority-escalation] user=7   low=9.10  high=0.00  ratio=7.28  threshold=2.5
[priority-escalation] user=7   upgraded task#88 "Fix client report"  NONE → THREE  (score=4.00)

# No upgrade:
[priority-escalation] user=42  low=6.73  high=3.23  ratio=1.50  threshold=2.5
[priority-escalation] user=42  → below threshold, no upgrade

[priority-escalation] run complete at 2026-03-21T22:55:00.000Z  upgrades=1  users_checked=3  sensitivity=5
```

---

## Coordination with Other Crons

| Cron | Schedule | Notes |
|---|---|---|
| `startPriorityEscalation` | **23:55** Cairo | Runs first — promotions applied before midnight |
| `startRecurrenceRoller` | **00:00** Cairo | Runs after — recurrence is rolled with updated priorities |
| `startAdminNotificationChecker` | its own schedule | Independent, no ordering dependency |

---

## How to Tune

1. Open `src/lib/priority-escalation.ts`
2. Both constants are at the very top of the file — change the values and restart the server.

### `ESCALATION_SENSITIVITY` (1–10)

| Value | Behaviour |
|---|---|
| 1–3 | Tasks almost never escalate via ratio — only severely neglected backlogs |
| 4–6 | Balanced — default range |
| 7–10 | Escalation fires frequently; moderate backlogs will be promoted |

### `HARD_AGE_CAP_DAYS`

| Value | Behaviour |
|---|---|
| 30 | Strict — no NONE/THREE/TWO task survives a month ungrouped |
| 60 | Default — balanced |
| 90+ | Lenient — only very long-neglected tasks get the override |
