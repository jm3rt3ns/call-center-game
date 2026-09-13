# Call Center Chaos 3D - Game Specification

**Status:** handoff spec, v1.0
**Purpose:** everything a new team needs to build a 3D version of *Call Center
Chaos* from scratch, without reading the existing code.
**Scope of this document:** what the game *is* and how it must *behave*. It does
not choose an engine, a renderer, a language, or an asset pipeline - those are
the build team's call. Where the existing 2D game is a useful reference for an
edge case, it is cited as "reference build".

The reference build is the shipped 2D isometric game in this repository
(`config.js` holds every tunable, `entities.js` the actor behaviour, `game.js`
the rules). It is the source of truth for any behaviour this document leaves
ambiguous, but it is *not* a design constraint: where this spec disagrees with
it, this spec wins, and the sections marked **Change from the reference build**
are deliberate.

---

## 1. The game in one paragraph

You are a bad call-centre manager. Ten employees sit at desks making sales
calls, and every call earns money. Left alone, they drift off to the coffee
machine and the bathroom, and earn nothing while they are gone. You pace the
floor: standing over someone makes them work harder, you can dump the coffee
pot and close the bathroom to cut off the escape routes, and you can order
anyone you catch in the corridor back to their desk. All of it works, and all
of it winds them up. Hit the day's revenue target before 5pm without pushing a
single employee past breaking point. If one of them snaps, they come for you,
and the day ends there.

The joke is the loop: every tool you have for making the number go up is also a
tool for making a person worse. There is no way to win kindly.

---

## 2. Design pillars

These decide arguments. Anything that weakens one is the wrong call.

1. **Presence is the mechanic.** The core verb is *being somewhere*. Every
   ability is gated on physical proximity, never on a menu. The player's body in
   the space is the interface. This is the pillar that makes a 3D version worth
   building, and it is the one the camera modes exist to explore.
2. **Cruelty is efficient, and legible.** Pressure always works. The player must
   be able to see, moment to moment, exactly how much damage they are doing -
   the numbers going up and the person getting worse must be visible in the same
   glance.
3. **A workday is five minutes.** Sessions are short, readable and replayable.
   No progression systems, no unlocks, no save. You lose, you shrug, you press
   start again.
4. **The office is a real place.** One floor, no loading, everything visible
   from anywhere the player can stand. The floor plan is data, authored as text,
   and the whole game reads from it.
5. **The camera changes the ethics, not the rules.** The three view modes are
   the same simulation seen from three distances of complicity. Nothing in the
   simulation may branch on which camera is active (see §7.1).

---

## 3. Session structure and core loop

| | |
|---|---|
| Session length | One workday, default **5 real minutes** (configurable 1-60) |
| In-fiction day | **8:00am to 5:00pm**, 9 in-game hours mapped linearly onto the session length |
| Simulation speed | One global multiplier, default **1.2x**, range 0.25x-4x. It scales *everything* driven by time - the clock, employees, the player, animation - from a single delta. It is a player-facing setting. |
| Goal | Reach the **revenue target** before the clock runs out |
| Fail | Any employee's **Stress** reaches 100, at any point |
| Between sessions | Nothing persists. Settings and the chosen camera mode persist; progress does not. |

**The loop, per 10-20 seconds of play:**

1. Read the floor - who is walking, who is about to walk, who is nearly at 100.
2. Move to the person or the choke point that matters.
3. Apply pressure (stand over them / order them back / cut off a facility).
4. Watch revenue rise and stress rise with it.
5. Back off and let someone recover, or don't.

---

## 4. The world

### 4.1 Layout

A single open-plan floor, one storey, fully enclosed by walls. Three room types:

| Room | Contents | Role in the loop |
|---|---|---|
| **Workspace** | Desk clusters, each seating one employee; open corridors between them | Where money is made. The bulk of the floor. |
| **Break room** | The **coffee station** (exactly one per level) | Destination for coffee breaks. Closeable by the player. |
| **Bathroom** | The **stall** (exactly one per level) | Destination for bathroom breaks. Closeable by the player. |

The two facility rooms sit behind doorways off the workspace, so the corridors
between them and the desks are natural interception points. That geometry *is*
the level design: the player's job is largely about standing in doorways.

### 4.2 Authoring format

Levels are authored as **flat text, one character per grid cell, one line per
row** - readable and diffable in any text editor, and paintable in a level
editor tool. This format must survive into the 3D version unchanged; it is what
makes levels cheap to make.

```
########################################
#bbbbbbbbbbbbbbbbb#tttttttttttttttttttt#
#bbbbCbbbbbbbbbbbb#ttttttttttWttttttttt#
########..##################..##########
#......................................#
#...................M..................#
#...DD.....DD.....DD.....DD.....DD.....#
#...DD.....DD.....DD.....DD.....DD.....#
########################################
```

| Char | Tile | Walkable | Notes |
|---|---|---|---|
| `.` | Floor | yes | |
| `#` | Wall | no | Full-height in 3D |
| `D` | Desk | no | Each connected clump of `D` = **one** desk seating one employee |
| `b` | Break room floor | yes | |
| `t` | Bathroom floor | yes | |
| `C` | Coffee station | yes | Exactly one per level |
| `W` | Bathroom stall | yes | Exactly one per level |
| `M` | Player spawn | yes | Exactly one per level |

Rules the loader must keep: ragged rows pad with floor; unknown characters
become floor with a warning; levels may be any size; a level missing a facility
still loads with a fallback rather than crashing. The two shipped levels are
40x24 and 30x16 cells.

**3D additions to the format.** Geometry the text cannot express is derived or
carried in a small optional header block (YAML-ish key/value lines above the
map, ignored by the 2D-style parser):

- Wall height (default 2.6 m), ceiling on/off, ceiling light spacing
- Window walls (which wall runs carry glazing - matters for time-of-day light)
- Prop density / theme id for set dressing (plants, printers, water cooler,
  whiteboards) - decorative only, never blocking, never gameplay-relevant
- Optional per-desk facing override (which way a chair points)

Everything else is generated from the grid: wall meshes from `#` runs, desk
assemblies from `D` clumps, ceiling from the room bounds, navmesh from walkable
cells.

### 4.3 Scale

The simulation is authored in **tiles**. The recommended world mapping is
**1 tile = 0.8 m**, which puts a 2x2 desk clump at 1.6 m square and a two-tile
corridor at 1.6 m - tight but passable, which is the intended feel.

| Quantity | In tiles | At 0.8 m/tile |
|---|---|---|
| Player move speed | 6.0 tiles/s | 4.8 m/s |
| Employee move speed | 3.0 tiles/s | 2.4 m/s |
| Player presence radius ("the aura") | 4.0 tiles | 3.2 m |
| Player collision capsule | ~1.4 tiles wide | 0.55 m radius, 1.85 m tall |
| Employee collision capsule | ~1.2 tiles wide | 0.5 m radius, 1.75 m tall |
| Wall height | - | 2.6 m |

The player moves at twice employee speed. That ratio is load-bearing: it is what
makes interception feel possible, and it must not change. The absolute speeds
may be re-tuned for comfort (see §7.6 on first-person speed perception) as long
as the 2:1 ratio and the aura-radius-to-speed relationship hold.

---

## 5. Actors

### 5.1 The player (the manager)

The only player-controlled entity. One per session, spawns on the level's `M`
tile.

- Moves freely (not grid-locked, not pathfound) with collision against walls and
  desks. Axis-separated collision resolution, so sliding along a wall feels
  smooth rather than sticky.
- Cannot leave the level bounds, cannot enter desks, **can** enter the break
  room and bathroom.
- Does not collide with employees in the reference build; in 3D he should push
  through them with a soft shove (they stumble, he is not slowed). Being unable
  to be blocked by your own staff is thematically correct and avoids a
  frustration that has no upside.
- Carries a permanent **presence aura** (§6.3) - a 3.2 m radius of effect
  centred on him, visualised on the floor.
- Has no health, no stamina, no resource but time.

### 5.2 Employees

3-20 per session, default **10**. Each has a name drawn from a pool, an assigned
desk, and two stats.

| Stat | Range | Meaning | Player-visible as |
|---|---|---|---|
| **Stress** | 0-100, starts **50 ± 10** | How close this person is to snapping. **Reaching 100 ends the run.** | A bar per employee, plus colour state on the character |
| **Productivity** | 10-100, starts **50 ± 10** | Revenue multiplier and break frequency | A second bar per employee |

> **Naming note / change from the reference build.** The reference build calls
> the first stat `sanity` but treats it as *insanity* - it rises under pressure
> and 100 is the fail state. The 3D version must name it **Stress** everywhere:
> code, UI, and design conversation. The old name has caused real confusion.

**Revenue per call** = `randomInt(5, 15) x (1 + (Productivity - 50) / 100)`,
floored. A call completes every **5 seconds** while an employee is at their
desk in any working state.

**Productivity's second job:** higher productivity makes employees need breaks
*more often*, not less. The break interval is multiplied by
`1 - (Productivity / 100) x 0.5`, so a maxed-out employee needs a break in half
the time. Working people harder makes them leave sooner. This inversion is
deliberate and is the heart of the balance; do not "fix" it.

---

## 6. Simulation rules

### 6.1 Employee state machine

| State | Enters when | Behaviour | Exits when |
|---|---|---|---|
| **Working** | Default; on arriving back at desk | Seated, taking calls, accruing needs | A need triggers and the facility is open; player comes close; ordered back |
| **Pressured** | Player's aura covers them *while they are Working* | Same as Working, plus aura effects; **cannot start a break** | Player leaves the aura |
| **Walking to coffee** | Needs coffee, coffee available, not Pressured | Pathfinds to the coffee station | Arrives, or is ordered back |
| **Walking to bathroom** | Needs bathroom, bathroom open, not Pressured | Pathfinds to the stall | Arrives, or is ordered back |
| **On coffee break** | Arrived at coffee station | Idles for **30 s** | Timer ends, or the coffee is dumped |
| **On bathroom break** | Arrived at the stall | Idles for **30 s** (inside the stall, door shut) | Timer ends, or the bathroom is closed |
| **Walking back** | Break ends, or a facility shuts while en route / mid-break | Pathfinds back to their own desk, carrying a coffee cup if they got one | Arrives at desk |
| **Ordered back** | Player orders them back | Returns to desk and works for **60 s**; **cannot start any break** during this | Timer ends |

Precedence when both needs fire: **bathroom before coffee**.

Two consequences of this machine that are features, not bugs:

- An employee inside the player's aura **cannot start a break**. Standing over
  someone pins them at their desk, and the need keeps building while you stand
  there - so the moment you walk away, they leave.
- A need that cannot be satisfied (facility shut) keeps accruing stress at a
  slow trickle while they sit there and stew.

**Change from the reference build:** in 2D, the aura only affects employees who
are *seated*, and an employee already walking is immune to it. In 3D, a
Pressured employee who is already walking should visibly flinch, speed up, and
take a wider path around the player, but must still not be forced into any
state change by proximity alone - the only thing that turns a walker around is
an explicit order. Keep that rule; add the reaction.

### 6.2 Needs and timers

| Timer | Base | Notes |
|---|---|---|
| Coffee need interval | **120 s** | x `(1 - Prod/100 x 0.5)` x random **0.5-1.8** |
| Bathroom need interval | **180 s** | same modifiers |
| Coffee break duration | **30 s** | |
| Bathroom break duration | **30 s** | |

All timers advance only while the employee is at their desk in a working state -
they do not tick while walking or on break. All timers are in **simulated
seconds** (i.e. already scaled by the global speed multiplier).

### 6.3 Stat changes - the complete table

Positive Stress is bad for the employee. Rates are per simulated second;
one-shot values are marked.

| Event | Stress | Productivity |
|---|---|---|
| Sitting at a desk working (passive) | **+0.3/s** | **-0.15/s** |
| Player's aura covering them at their desk | **+0.5/s** | **+0.3/s** |
| Needs coffee, coffee is dumped, sitting at desk | **+0.1/s** | - |
| Needs bathroom, bathroom is closed, sitting at desk | **+0.15/s** | - |
| Finishing any break | **-15** (one-shot) | **-5** (one-shot) |
| Being ordered back to desk | **+10** (one-shot) | **+10** (one-shot) |
| Coffee dumped, if they wanted coffee or were on a coffee break | **+5** (one-shot) | **+10** (one-shot) |
| Bathroom closed, if they needed it or were on a bathroom break | **+8** (one-shot) | **+12** (one-shot) |

Stress clamps to 0-100; Productivity clamps to 10-100. Stress hitting 100 ends
the run immediately.

Thresholds for presentation: **75** = warning (amber), **90** = critical (red,
plus an alarm sound the first time each employee crosses it).

Read the table as a sentence: *the only thing that lowers stress is a completed
break, and every tool you have either shortens a break or prevents one.*

### 6.4 Player verbs

| Verb | Trigger condition | Effect | Duration / cooldown |
|---|---|---|---|
| **Move** | Always | - | - |
| **Loom** (passive) | Automatic, anyone inside the 3.2 m aura | Per-second stat changes above; suppresses break starts | Continuous |
| **Order back to desk** | Target is *walking* (to or from a facility) **and** inside the aura | Target returns to their desk and is pinned there for 60 s; +10 Stress, +10 Productivity | Instant, no cooldown |
| **Dump the coffee** | Anywhere on the floor | Coffee station unusable for **60 s**. Anyone on a coffee break is sent back; anyone who wanted coffee takes the one-shot hit | 60 s lockout, no separate cooldown; cannot re-trigger while active |
| **Close the bathroom** | Anywhere on the floor | Stall unusable for **60 s**, same pattern | As above |

Both facility abilities are global, usable from anywhere - they are phone calls
to facilities, not physical acts. They are *not* gated on proximity, and should
not be: they are the player's answer to being in the wrong place.

**Change from the reference build:** ordering someone back teleports them to
their desk in 2D. In 3D that is unacceptable. The ordered employee turns on the
spot, plays a cowed reaction, and **walks back under their own power at 1.3x
normal speed**, entering the pinned state on arrival - but the stat changes land
immediately, at the moment of the order. The stat timing matters for feel; the
teleport does not.

### 6.5 Pathfinding and traffic

- Employees navigate on the walkable grid; in 3D, a navmesh baked from it.
  Grid-accurate paths are not required - natural-looking paths are better - but
  employees must never path through walls or desks, and the corridor choke
  points must remain choke points.
- Employees do not collide with each other in the reference build. In 3D they
  need **soft avoidance**: they steer around each other without stopping, and
  never deadlock. Two employees may occupy the same tile.
- **Queueing (new in 3D).** One coffee station and one stall serve up to 20
  people, and in 2D they simply overlap. 3D needs: the coffee station has 1
  service slot and a queue line of 3-4 marked waiting positions; the stall has 1
  slot and a queue outside the door. **Time spent queueing does not count
  against the 30 s break timer** - the break starts when they reach the slot.
  Queueing is a working-adjacent state: no stress relief, and the player can
  order a queued employee back.
- The bathroom stall is **opaque**: the employee enters, the door shuts, and
  nothing of what happens inside is visible or enterable by any camera. The
  player may close the bathroom while it is occupied; the occupant then exits
  immediately, mid-break, and walks back.

### 6.6 Win, lose, and the end of the day

- **Win:** the clock reaches 5:00pm and revenue >= target.
- **Lose (missed target):** clock reaches 5:00pm and revenue < target.
- **Lose (breakdown):** any employee's Stress reaches 100, at any moment. The
  run ends there, named: *"[Name] has gone insane and attacked you."*

The breakdown ending should be staged in 3D: time slows, the employee stands up
from their desk, and the ending plays out on that character wherever they are on
the floor - lit, framed, and read as a person, not a fail card. Each camera mode
handles it per §7.7.

**End-of-day summary** (all three endings): final revenue vs target, total calls
made, total breaks taken, coffee dumps, bathroom closures, employees ordered
back. Plus, for the 3D version, a **"human cost" line** - peak stress reached,
and the name of whoever came closest. The summary is where the joke lands; give
it room.

### 6.7 Balance notes for the 3D team (read this)

The reference build is not balanced, and the port is the moment to fix it:

1. **Revenue is trivially met.** Ten employees at one call per 5 s, averaging
   10 pesos, earn roughly 1,200/minute - so a 5-minute day earns ~6,000 against
   a default target of 500-2,000. The revenue goal essentially never fails. The
   real game is entirely the stress fail state. Either raise the target to
   roughly **60-70% of the theoretical maximum for the chosen employee count and
   day length** (i.e. compute it, don't hardcode it), or cut per-call revenue
   hard. Recommendation: compute the target from the settings, and expose a
   difficulty multiplier on top.
2. **The default target is inconsistent** between the config (2,000) and the
   menu (500) in the reference build. Pick one source of truth.
3. **Stress has no downward pressure except breaks.** Passive stress is +0.3/s
   at the desk, so a day is a slow climb interrupted by -15 break refunds. With
   breaks blocked, an employee starting at 50 hits 100 in well under two
   minutes. That is the intended shape; verify it still holds after any change
   to timings, because it sets the entire pacing of the session.
4. **Scaling employee count changes difficulty non-linearly**: more employees =
   more revenue *and* more chances that someone snaps while you are elsewhere.
   The target should scale with employee count if it is computed.

---

## 7. Camera and movement - the three modes

This is the centre of the 3D design. The game ships with **three camera modes**,
chosen in the main menu and switchable at any time during play. They are not
difficulty options or accessibility fallbacks; they are three readings of the
same fiction, and the player is expected to try all three.

| Mode | Projection | You see | The feeling |
|---|---|---|---|
| **Isometric** (default) | Orthographic | The floor plan and your manager on it | A management sim. Clean, tactical, complicit at a distance. |
| **First person** | Perspective | Through the manager's eyes | You are the bad manager. Nobody's face is abstract any more. |
| **Second person** | Perspective | Yourself, through an employee's eyes | You are the thing in someone else's day. |

### 7.1 The one inviolable rule

**The simulation must not know which camera is active.** No stat, timer,
threshold, AI decision, or win condition may branch on camera mode. A recorded
input sequence played back in all three modes must produce an identical
simulation.

The only permitted mode-dependent values are the **assist constants** below,
which govern how the player's *intent* is read - never what that intent does:

| Assist constant | Iso | First person | Second person |
|---|---|---|---|
| Target selection method | Cursor pick / nearest-in-aura | Look-at raycast | Nearest-in-aura, camera-weighted |
| Selection cone / radius tolerance | 1.0 m screen-projected | 8° cone, snap to nearest valid | 1.5 m, ties broken toward the camera |
| Order-back reach | aura radius (3.2 m), unchanged | unchanged | unchanged |
| Movement input basis | camera basis | player facing | latched camera basis (§7.4) |

Everything downstream of selection - who gets ordered back, what it costs them -
is identical.

### 7.2 The shared camera contract

Every mode implements the same interface, so modes can be added later without
touching gameplay:

- **Focus target** - what the camera cares about (the player, or a host).
- **Desired transform per frame** - position, orientation, projection params.
- **Movement basis** - the frame that the player's directional input is
  interpreted in.
- **Interaction resolver** - how a raw "act on someone" input picks a target.
- **UI profile** - which HUD layout is active (§8).
- **Occlusion policy** - what to do about geometry between camera and subject.

**Switching:** instant input remap, with a **0.3 s eased blend** of position and
orientation between third-person modes, and a **hard cut** into and out of first
person (a blend through the player's own head is worse than a cut). The
simulation does not pause. Movement input held across a switch is re-based on
release, never mid-press.

### 7.3 Mode A - Isometric 3D (orthographic)

The default, and the mode the game is balanced around.

**Camera.**
- **Orthographic** projection. This is a requirement, not a preference: the
  parallel projection is what makes the floor plan readable as a plan.
- Fixed pitch **30°** (down from horizontal), fixed yaw **45°** by default.
- **Yaw may be rotated by the player in 90° steps** (and only in 90° steps), to
  see behind desk banks and wall runs. Each rotation is a 0.25 s eased turn.
  The movement basis rotates with it.
- Zoom is a change in **orthographic size**, not a dolly. Range roughly 8-24 m
  of visible floor width, default sized so a tile reads at a comfortable size
  on the target screen - a phone needs to be zoomed much closer than a monitor,
  and the default should be derived from screen size rather than fixed.

**Follow behaviour** (all values from the tuned reference build; keep them):
- Exponential ease toward the focus point at a rate of **4.5 per second**
  (frame-rate independent).
- **Deadzone** around the focus: the player may drift ~70 screen-px
  horizontally / ~42 vertically before the camera bothers to move. Prevents
  pacing around a desk from sliding the whole office.
- **Look-ahead** of **0.35 s** of the player's current velocity, so the view
  opens up in the direction of travel.
- Focus is lifted off the player's feet to frame the body, not the floor.
- The visible region is clamped to the level bounds - never show void past the
  edge of the office. If the level is smaller than the view on an axis, centre
  on it.

**Occlusion.** The camera looks down into an enclosed room, so:
- The **ceiling is hidden entirely** in this mode.
- Wall runs between the camera and the floor are **cut away** - the near two
  walls of any room render at reduced height or fade out. This must be a stable,
  per-wall-run decision based on wall orientation vs camera yaw, not a per-pixel
  effect, so it does not flicker as the player moves.
- Any prop or character that would be hidden behind geometry from this angle
  renders a **silhouette outline** through it.

**Movement.** Camera-relative: "up" on the stick/W means away from the camera
along the projected ground plane. The character turns to face movement and
accelerates to full speed in ~0.1 s (near-instant; this is an arcade game, not a
weighty one).

**Targeting.** Two ways to order someone back, both available:
- **Proximity + button:** the nearest valid target inside the aura, with an
  on-character highlight showing who will be picked.
- **Point and click/tap:** pick a specific character under the cursor. Still
  requires them to be inside the aura - pointing is a convenience, never a way
  to act at range.

Everyone the player could currently act on wears a ring at their feet. This is
the mode's central readability feature: the aura is drawn on the floor as a
decal, and the rings tell you exactly what the aura has caught.

### 7.4 Mode B - First person

**Camera.**
- Perspective, eye height ~1.7 m, default FOV **75°** (adjustable 60-100°).
- Standard mouse/stick look. Pitch clamped to ±85°.
- Subtle head bob tied to actual movement speed - **and a toggle to disable it,
  defaulted on for the player's first session and off-able in one click.**
- A visible body: looking down shows legs and torso, and the player's hands hold
  a clipboard. This is worth the cost; a floating camera undoes the pillar.

**Movement.** Player-facing-relative (standard FPS). Strafe supported. Same
speed as every other mode (see §7.6 on why that needs care).

**Targeting.** Crosshair raycast from the camera, limited to the aura radius,
with an 8° forgiveness cone that snaps to the nearest valid target. A world-space
prompt appears over a valid target ("Send back to desk"), and only over targets
the order would actually work on.

**The aura problem, and its fix.** In first person the player cannot see the
floor decal that tells them their reach. Solve it with three redundant cues:
1. A **faint ground ring** visible in peripheral vision when looking anywhere
   near horizontal, brightest at the boundary.
2. **Employee reactions as a rangefinder** - employees visibly flinch, hunch, and
   raise their typing speed the moment they enter the aura. The player learns
   the radius by watching people, which is exactly the right thing to be
   learning.
3. An optional **compact proximity readout** on the clipboard: the nearest
   employee's name and stress, and whether they are in reach.

**Presentation.** This mode carries the most fiction: headset chatter, keyboards,
the specific sound of somebody stopping typing when you walk past, faces looking
up and then away. Budget for face-level detail on employee characters - it is
only visible here and it is the entire point of the mode.

**Abilities.** The two facility abilities remain global (they are phone calls),
but in first person they should also be physically available: standing at the
coffee station and pressing the interact key pours the pot out, with the full
animation. Same effect, two routes.

### 7.5 Mode C - Second person

The camera lives on somebody else and looks at you. You play the manager; you
see him from an employee's eyes.

**Host selection.** Each frame, score every employee and pick a **host**:
- **Eligible:** alive, not inside the bathroom or the stall, not inside a
  transition (sitting down, standing up), has line of sight to the player, and
  is within **12 m**.
- **Score:** prefer near, prefer hosts already facing the player, prefer hosts
  whose stress is high (their view is the interesting one), and strongly prefer
  the host you already have.
- **Hysteresis is mandatory:** minimum host dwell time **3 s**; a challenger
  must beat the incumbent's score by **25%** for a continuous **1.5 s** before a
  switch happens. A camera that hops between hosts is unplayable.
- **Handover** is a 0.35 s eased blend between the two head positions, not a cut.

**Fallback chain**, when no employee is eligible (the player is alone in a
corridor, or in the bathroom):
1. Nearest **ceiling security camera** with line of sight - place these at level
   authoring time, one per room minimum, with a deliberately cheap, high, wide
   framing and a subtle CCTV treatment.
2. If none has line of sight: a **fixed-yaw shoulder camera** at 3.5 m, the same
   yaw as the last host used. Neutral and never disorienting.

The player should always be able to see themselves. Falling back is normal and
should feel like the building watching instead of a person.

**Framing.** Camera at the host's eye height with their head aim driving it - the
host's head and eyes track the player, so the camera tracks the player. Add:
- **Handheld noise** scaled by the host's stress: almost still at Stress 20,
  visibly unsteady at 90.
- A **stress vignette and desaturation** on the host's view, ramping over the
  same range. Their state is the post-processing.
- **Breathing audio, keyboard sounds, and headset chatter** mixed from the
  host's position - this mode's soundscape is the host's, not the player's.
- The host's own body (nose, arms, monitor edge) may frame the shot, but must
  **never occlude the player**: fade any host geometry that crosses the player's
  silhouette.
- The player wears a **permanent subtle rim light / outline** in this mode. You
  must never lose yourself.

**Movement, and the flipping problem.** Camera-relative movement breaks when the
camera can change host and flip 180°. The rule:

> **Input frame latching.** When a directional input begins (stick pushed from
> centre, or the first movement key pressed after none were held), the movement
> basis is sampled from the camera at that instant and **held until all
> directional input is released**. A host handover mid-push does not re-base the
> player's movement; it only re-frames the shot.

Plus a **world-relative** control option in the settings, for players who prefer
it, and a 0.3 s eased rotation blend so even a released-and-repressed input
after a handover does not snap.

**Targeting.** Nearest valid target inside the aura, ties broken toward the
camera. Point-and-click targeting is **not** offered here - the camera is not the
player's instrument in this mode, and asking them to aim through someone else's
eyes is a worse experience than a good auto-pick.

**Why this mode exists.** It is the thesis. In isometric you manage numbers; in
first person you look people in the face; in second person you watch yourself
loom over someone while their hands shake. Everything about its presentation
should serve that: the player's own character should be lit and animated as a
*threat*, not as an avatar. Consider mode-specific animation weighting - a
slightly heavier walk, a slightly longer shadow.

### 7.6 Speed, comfort, and why the modes can't have different movement values

The same 4.8 m/s that reads as brisk in isometric reads as absurd in first
person. The temptation is to slow the player down in first person. **Don't** -
it would break §7.1 and change the balance of interception, which is the whole
game.

Solve it with perception instead:
- Slightly wider FOV when moving at full speed (a 3-5° kick, eased).
- Head bob and footstep cadence matched to real speed.
- Motion blur off by default; a comfort-focused option set.
- If, after playtesting, the speed genuinely cannot be made comfortable, the
  correct fix is to **change the speed in all three modes at once** and re-tune
  the aura radius against it.

### 7.7 Endings, per mode

The breakdown ending must land in each mode:
- **Isometric:** the camera breaks its follow rules for the first time all game -
  it pushes in on the employee, the time-of-day grade drops out, everything else
  desaturates.
- **First person:** they stand up and walk toward the camera. No cut away, no
  mercy. Control is taken smoothly, not snapped.
- **Second person:** if the breaking employee is not already the host, force a
  handover **to them** (the one time hysteresis is overridden) and play the
  ending from inside their head, looking at the player.

Win and miss-target endings return to a neutral framing on the player and fade
to the summary.

---

## 8. Interface

The HUD is per-mode, but the **information** is the same in all three. Every
mode must answer, at a glance: how much money, how much time, is anyone about to
break, and what is my reach.

### 8.1 Core readouts (all modes)

| Readout | Content |
|---|---|
| Revenue | Current / target, with a pop animation on each call |
| Clock | In-fiction time (8:00am - 5:00pm) **and** real time remaining |
| Coffee status | Available, or DUMPED with a countdown |
| Bathroom status | Open, or CLOSED with a countdown |
| Employee state | Per-employee name, Stress bar, Productivity bar, current activity |
| Reach | Who, if anyone, the act-on-someone input would land on |

### 8.2 Per-mode treatment

- **Isometric.** A conventional HUD: bar across the top, an employee list at the
  side. On a small screen the list collapses to the **two employees that matter
  right now** (nearest to the player, with anyone critical pulled to the front),
  and everyone else carries a floating name-and-bars plate above their head when
  the player is near them. Anyone at critical stress always shows their plate,
  wherever they are.
- **First person.** Minimal screen furniture. Revenue and clock live on the
  **clipboard in the player's hand**, glanceable by pressing a key that raises
  it; the employee list is a page on that clipboard. Critical-stress employees
  are signalled by **audio and by a directional edge indicator**, not a list.
  Overhead plates appear on employees the player looks at.
- **Second person.** The HUD is framed as the **host's** perception: the core
  readouts sit low and small, the host's own stress is the most prominent
  element on screen, and other employees' plates appear only when the host can
  see them. A caption names whose eyes you are in.

### 8.3 Menus and settings

Main menu, in-game pause, end-of-day summary. The following are player-facing
settings, all changeable before a run and (except employee count and level) in
the pause menu:

- Employee count (3-20, default 10)
- Day length in real minutes (1-60, default 5)
- Revenue target (see §6.7 - prefer computed with a difficulty multiplier)
- Simulation speed (0.25x-4x, default 1.2x)
- **Camera mode** (isometric / first person / second person)
- FOV, head bob, camera shake, motion blur, blend times
- Colourblind-safe state palette (see §11)
- Audio mix: master / SFX / ambience
- Level select, and a level editor entry point

---

## 9. Art direction

### 9.1 Register

Stylised, readable, slightly cruel. Not photoreal and not cute. The 2D game is
pixel art; the 3D version should keep its *colour logic* - a cool blue-purple
office, warm amber for the coffee/break spaces, red reserved almost entirely for
the manager and for danger - while moving to simple, clean geometry with strong
silhouettes. Characters should read at isometric distance as a colour and a
posture, and hold up at first-person conversation distance. That second
requirement is the expensive one; budget for it.

### 9.2 Time of day

The workday's progress is shown through **light**, on a continuous ramp:

| Time | Light |
|---|---|
| 8:00-11:00am | Low warm sun through the windows, long shadows across the floor |
| 11:00am-2:00pm | Neutral, flat, overhead - the deadest part of the day |
| 2:00-5:00pm | Sun drops and reddens; the room warms and dims; shadows stretch the other way |

This replaces the 2D version's flat screen tint and is one of the best arguments
for the 3D build: the player should be able to feel how late it is without
reading the clock. Ceiling fluorescents carry the room once the sun goes.

### 9.3 Characters

Two character classes, both fully rigged, both needing the animation set below.

**The manager (player).** Distinctive silhouette, red palette accent, readable
from any angle and any distance. Must look *heavy* - he is the threat in second
person.

**Employees.** 3-5 visually distinct variants minimum, with colour/hair/build
variation on top, so a floor of 20 does not read as clones. They need face-level
detail (first person) and a clear seated-at-desk pose (every mode).

**Animation set.** This maps directly to the reference build's role list; the
same roles must exist in 3D.

| Role | Who | Used for |
|---|---|---|
| `idle` | both | Standing still |
| `walk` | both | Normal movement |
| `run` | manager | Sustained movement (the manager breaks into a run after ~0.26 s of moving, and drops back to a walk whenever geometry holds him under 60% of full speed) |
| `work` | employee | Seated, typing, on a call |
| `talk` | employee | On a call, animated |
| `wait` | employee | Queueing, on a break, arms crossed |
| `carry` | employee | Walking back holding a coffee |
| `hurt` / `cowed` | employee | Under the aura; flinch on entering it |
| `angry` | manager | Dumping the coffee |
| `slam` | manager | Closing the bathroom |
| `command` | manager | Ordering someone back (a pointed finger) |
| `celebrate` | manager | Win ending |
| `fall` | manager | Lose-on-target ending |
| `dead` | manager | Breakdown ending |
| `breakdown` | employee | Standing up, walking at the player - the fail state |
| `sit` / `stand` | employee | Transitions at the desk (new in 3D; the 2D game has no chairs) |

Reaction one-shots hold their final pose briefly (~0.25 s) before locomotion
resumes, so they read even mid-run.

### 9.4 Environment

Desks with monitors, chairs, headsets, keyboards, paper. A coffee machine that
can be visibly empty. A bathroom door that shuts. Cheap office carpet, ceiling
tiles, fluorescent panels, one sad plant per room. Every prop that gameplay
touches - coffee machine, stall door, desks, chairs - needs a "disabled" or
"occupied" state that is readable from across the room in isometric.

### 9.5 State colour language

Employee state is currently encoded in colour: green working, amber needs
coffee, blue needs bathroom, purple on break, orange under the aura, red
critical. In 3D this should move from body colour to **light and accessory** -
a coloured desk lamp / status light per desk, a mug in hand, a held phone -
with the colour language preserved. Colour must never be the *only* channel;
pair every state with a distinct pose or prop (see §11).

---

## 10. Audio

Audio is a first-class part of the design, especially in first and second person.

| Layer | Content |
|---|---|
| **Ambience** | Room tone, HVAC, distant phones, the collective hum of a call floor. Density scales with how many employees are actually working - a floor where everybody is on break sounds *wrong*. |
| **Employee audio** | Keyboards, headset chatter (unintelligible, looping, varied), chairs, sighs. Spatialised. Typing rate follows productivity; stopping typing when the manager arrives is a key cue. |
| **Player audio** | Footsteps (the approach is a threat - make it audible from further than the aura), clipboard, the coffee pot. |
| **Feedback** | Call completed / cash earned (subtle - it fires several times a second), ability triggers (coffee splash, bathroom door slam), order-back (a sharp authority sound), stress crossing critical (a distinct alarm, once per employee). |
| **Stress music** | Optional adaptive layer that thickens as the floor's peak stress rises. |

In second person, the whole mix re-centres on the host: their breathing, their
keyboard, their headset. This is the cheapest and strongest way to sell whose
eyes you are in.

---

## 11. Accessibility

Minimum bar, not aspirational:

- **Colourblind-safe palette option**, and state never conveyed by colour alone -
  every employee state has a distinct pose/prop as well.
- **Camera comfort:** FOV slider, head bob toggle, camera shake toggle, blend
  time slider, motion blur off by default. The second-person handheld noise must
  be disableable.
- **Simulation speed** is already a setting (0.25x-4x) and doubles as a
  difficulty and accessibility control. Say so in the UI.
- Full **key/button remapping**, on all three modes independently.
- **Subtitles/captions** for any spoken or narrative audio, and a visual
  substitute for every audio-only cue (notably the critical-stress alarm).
- **Text scaling** for the HUD, and a high-contrast HUD option.
- One-stick / one-hand play should be viable in isometric mode.

---

## 12. Platforms and technical targets

| | |
|---|---|
| Primary | Desktop, keyboard + mouse and gamepad |
| Secondary | Touch (phone/tablet) - isometric mode is fully playable; first and second person are supported with dual-stick and single-stick-plus-auto-camera respectively |
| Frame rate | 60 fps target on mid-range hardware in all modes; the simulation must be frame-rate independent (it already is - everything runs off one scaled delta) |
| Scale | Up to 20 employees, one floor, 40x24 tiles as the largest shipped level; the format allows larger |
| Determinism | Same inputs + same seed = same run. A seed field exists in the reference build and should be exposed for testing. |
| Persistence | Settings only. No save games, no accounts, no network. |
| Session | Load into a playable floor in under 5 seconds |

### 12.1 Touch controls (isometric, carried over from the reference build)

These are tuned and should be reused: drag anywhere on the floor to raise a
**floating stick** under the thumb (movement is in screen directions, not world
axes); **tap an employee** to order them back, which still requires the player
to be within the aura, with everyone in range visibly ringed and a failed tap
saying why ("Too far away" / "Already working"); **pinch to zoom**; the two
facility abilities live as on-screen buttons carrying their own cooldown
readout. Compact layouts collapse the HUD and the employee list as described in
§8.2.

---

## 13. Level editor

The editor is part of the product, not a tool. It ships with the game.

Requirements carried from the reference build:
- Paint tiles on a 2D plan; the map text and a live 3D preview update as you
  paint.
- Brush, rectangle, fill; right-click paints floor; undo.
- Validation with plain-language warnings: no coffee station, no bathroom stall,
  no desks, no spawn, a room the player can never reach, a desk with no adjacent
  walkable tile.
- **Playtest** loads the painted level straight into the game.
- Levels are text. Copying the text into the game's level list is how a level
  ships.

New for 3D:
- A second, optional **prop pass**: place decorative props and security cameras
  (the second-person fallbacks) on top of the painted grid.
- A camera-mode toggle in the preview, so a level can be checked for isometric
  occlusion *and* first-person sightlines before it ships.

---

## 14. What "done" looks like

### 14.1 Vertical slice (first milestone)

One level, one camera mode (isometric), five employees, and: desks, coffee
station, bathroom, the full employee state machine, the aura, all three player
verbs, both stats with the full §6.3 table, win and both lose conditions, and
the end-of-day summary. Nothing else. If the slice is not fun with placeholder
art, no amount of the rest will fix it - the loop in §3 is the entire product.

### 14.2 Definition of done for the full game

- [ ] All three camera modes, switchable mid-run, sharing one simulation (§7.1
      verified with a recorded-input playback test)
- [ ] Both shipped levels, plus the editor
- [ ] Full animation set for both character classes (§9.3)
- [ ] Time-of-day lighting ramp (§9.2)
- [ ] All three endings staged per mode (§7.7)
- [ ] Full audio bed, including the second-person host mix (§10)
- [ ] Accessibility bar met (§11)
- [ ] Revenue target rebalanced per §6.7 and re-tested at 3, 10 and 20 employees
- [ ] Touch control scheme for isometric (§12.1)

---

## 15. Open questions for the 3D team

These are real design decisions, not oversights. They need an owner.

1. **Does the player have a stress stat of their own?** The fiction supports it
   (the manager is also being ground down) and it would give the end summary a
   second axis, but it risks diluting a clean two-stat design. Currently: no.
2. **Should employees talk to each other?** Idle conversations between two
   employees in the break room would be enormously strong in first and second
   person, and would give the aura a visible effect (conversations stop when you
   arrive). Cost is dialogue and a social AI layer. Strong candidate for scope.
3. **Is the second-person mode host-locked or host-switchable by the player?**
   This spec says automatic with hysteresis. A deliberate "look through *that*
   person's eyes" verb is a different and possibly better game.
4. **How much do employees remember?** Currently nothing persists per employee
   beyond their stats. A memory of "how often has this manager stood over me"
   could drive escalating reactions at no simulation cost.
5. **Multiple floors / larger offices?** The format allows big levels; the
   camera work and the "everything visible from anywhere" pillar do not. Decide
   before level production starts.
6. **Does the revenue target get computed or authored?** §6.7 recommends
   computed. Whoever owns balance owns this.

---

## Appendix A - Complete tunable reference

Every number in the game, in one place. Times are in **simulated seconds**
(already scaled by the global speed multiplier) unless marked.

**Session**

| Key | Default | Range |
|---|---|---|
| Employee count | 10 | 3-20 |
| Day length (real minutes) | 5 | 1-60 |
| Revenue target | see §6.7 | - |
| Workday start / end | 8:00 / 17:00 | - |
| Simulation speed multiplier | 1.2 | 0.25-4.0 |

**Employee**

| Key | Default |
|---|---|
| Starting Stress | 50 ± 10 |
| Starting Productivity | 50 ± 10 |
| Stress range / fail threshold | 0-100 / 100 |
| Stress warning / critical thresholds | 75 / 90 |
| Productivity range | 10-100 |
| Move speed | 3 tiles/s |
| Coffee need interval (base) | 120 s |
| Bathroom need interval (base) | 180 s |
| Productivity break multiplier | 0.5 (interval x `1 - Prod/100 x 0.5`) |
| Break timing randomisation | x 0.5 - 1.8 |
| Coffee / bathroom break duration | 30 s / 30 s |
| Revenue per call | random 5-15, x `1 + (Prod-50)/100` |
| Call duration | 5 s |
| Break completion | Stress -15, Productivity -5 |
| Passive at desk | Stress +0.3/s, Productivity -0.15/s |
| Blocked coffee / bathroom need | Stress +0.1/s / +0.15/s |
| Ordered-back pin duration | 60 s |
| Ordered-back effect | Stress +10, Productivity +10 |
| Walk-back speed after an order | 1.3x normal |

**Player**

| Key | Default |
|---|---|
| Move speed | 6 tiles/s (2x employee) |
| Aura radius | 4 tiles (3.2 m) |
| Aura effect | Stress +0.5/s, Productivity +0.3/s |
| Coffee dump lockout | 60 s |
| Bathroom close lockout | 60 s |
| Coffee dump effect on affected employees | Stress +5, Productivity +10 |
| Bathroom close effect on affected employees | Stress +8, Productivity +12 |
| Walk-to-run threshold | 0.26 s of sustained movement, 60% of full speed |

**Isometric camera**

| Key | Default |
|---|---|
| Projection | Orthographic |
| Pitch / yaw | 30° / 45°, yaw rotatable in 90° steps |
| Follow smoothing | 4.5 /s exponential ease |
| Deadzone | ~70 x ~42 screen px |
| Look-ahead | 0.35 s of velocity |
| Visible floor width | ~8-24 m, derived from screen size |
| Bounds | Clamped to the level; centre if the level is smaller than the view |

**First-person camera**

| Key | Default |
|---|---|
| Eye height | 1.7 m |
| FOV | 75° (60-100 adjustable) |
| Pitch clamp | ±85° |
| Selection cone | 8°, snap to nearest valid, reach = aura radius |

**Second-person camera**

| Key | Default |
|---|---|
| Host search radius | 12 m, line of sight required |
| Minimum host dwell | 3 s |
| Challenger margin / duration | 25% better for 1.5 s |
| Handover blend | 0.35 s eased |
| Fallbacks | Ceiling camera with LOS -> fixed-yaw 3.5 m shoulder camera |
| Handheld noise / vignette | Scales with host Stress, 20 -> 90 |

**Mode switching**

| Key | Default |
|---|---|
| Third-person to third-person blend | 0.3 s eased |
| Into / out of first person | Hard cut |
| Input re-basing | On input release, never mid-press |

---

## Appendix B - Reference build cross-reference

For anyone who wants to check behaviour against the shipped 2D game:

| Topic | Where |
|---|---|
| Every tunable, plus the state enums | `config.js` |
| Employee AI, state machine, stat changes; manager movement and abilities | `entities.js` |
| Game loop, win/lose, ability handling, targeting | `game.js` |
| Floor plan, projection, A* pathfinding, environment art | `office.js` |
| Follow camera - smoothing, deadzone, look-ahead, bounds clamping | `camera.js` |
| Level format, the two shipped levels, validation | `levels.js` |
| Touch controls | `input.js` |
| Menus, HUD, employee list, end screens | `main.js` |
| Audio | `sounds.js` |
| Level editor | `editor.html`, `editor.js` |
| Character art spec and animation roles | `assets/sprites/README.md` |
