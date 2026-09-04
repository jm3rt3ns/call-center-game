# Call Center Chaos

A 2D isometric pixel-art management sim that runs in the browser with no build
step. You are the manager: pace the floor, block the coffee and the bathroom,
and hit the revenue target before 5pm without driving anyone over the edge.

## Play it online

The game is live at <https://superboss.jackmertens.com>, redeployed from
`main` on every push. `DEPLOY.md` covers the Cloudflare setup.

## Download a build

Every merge to `main` publishes a release with a zip of the game. Grab the
newest one from the [Releases page](../../releases), unzip it, and run
`play.sh` (macOS/Linux) or `play.bat` (Windows) - it serves the folder on
<http://localhost:8000> and opens it.

## Running it from a checkout

Any static file server works - the sprite packs are fetched over HTTP, so
opening `index.html` from the filesystem will not load them:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| key | action |
|---|---|
| WASD / arrows | move |
| C | dump the coffee |
| B | close the bathroom |
| Space | send a colliding employee back to their desk |

## Layout

| file | what it does |
|---|---|
| `config.js` | every tunable in one object, plus the shared enums |
| `levels.js` | the levels themselves, as flat map text, and the code that reads it |
| `sprites.js` | sprite-pack loading and animation playback |
| `entities.js` | the manager and the employees, their AI and their drawing |
| `office.js` | turns a level into the floor plan, isometric projection, A* pathfinding, environment art |
| `game.js` | game loop, win/lose rules, the render pass |
| `main.js` | menus, HUD, input, end screens |
| `sounds.js` | synthesised sound effects |
| `editor.html`, `editor.js`, `editor.css` | the level editor |
| `assets/sprites/` | character sprite packs - see its own README |

## Levels

A level is a flat block of text - one character per grid cell, one line per row.
They live in `levels.js`:

```
########################
#bbbbbbbb#tttttttttttt.#
#bbbCbbbb#tttttWttttttt#
######..#########..#####
#......................#
#...DD.....DD.....DD...#
#...DD.....DD.....DD...#
#..........M...........#
########################
```

| char | tile |
|---|---|
| `.` | floor |
| `#` | wall |
| `D` | desk - each connected clump of `D` seats one employee |
| `b` | break room floor |
| `t` | bathroom floor |
| `C` | coffee station (one per level) |
| `W` | bathroom stall (one per level) |
| `M` | where the manager starts (one per level) |

Rows do not have to be the same length - short ones are padded with floor - and
the level can be any size. The view scales itself so the whole floor plan fits
on screen.

### The level editor

Open `editor.html` (or the **Level Editor** button on the main menu). Pick a
tile, drag on the plan on the left, and the map text on the right and the
isometric preview update as you go. Right-click paints floor, `Ctrl`+`Z` undoes,
and the rectangle and fill tools make rooms quick to block out. It also warns
about the things that break a level: no coffee station, no desks, a room the
manager can never walk to.

**Playtest** loads what you have painted straight into the game; the menu then
says `Level: Custom` until you click *use the built-in level*. To keep a level
for good, copy the map text into a new entry in `LEVELS` in `levels.js` - it
shows up in the editor's level list on the next reload.

Characters draw from sprite packs when one is assigned to them in
`CONFIG.sprites.actors`, and fall back to procedural pixel drawing otherwise.
`assets/sprites/README.md` covers adding a pack.
