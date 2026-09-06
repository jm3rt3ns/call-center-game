# Call Center Chaos

A 2D isometric pixel-art management sim that runs in the browser with no build
step. You are the manager: pace the floor, block the coffee and the bathroom,
and hit the revenue target before 5pm without driving anyone over the edge.

## Play it online

The game is live at <https://superboss.jackmertens.com>, redeployed from
`main` on every push. `DEPLOY.md` covers the Cloudflare setup.

## Download a build

Every merge to `main` publishes a release with a zip of the game. Grab the
newest one from the [Releases page](../../releases), unzip it, and open
`index.html`. `play.sh` (macOS/Linux) and `play.bat` (Windows) are there too -
they serve the folder on <http://localhost:8000> and open it, which is handy if
your browser locks down local files.

## Running it from a checkout

Opening `index.html` works, and any static file server works:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

The pack manifests are read with `fetch()` when the page is served and from the
generated `assets/sprites/manifests.js` when it is not, so the sprite art shows
up either way. Re-run `python3 scripts/gen-sprite-manifests.py` after editing a
pack manifest - the release and deploy builds fail if it has drifted.

## Controls

| key | action |
|---|---|
| WASD / arrows | move |
| C | dump the coffee |
| B | close the bathroom |
| Space | send a colliding employee back to their desk |

## Game speed

The whole simulation - the workday clock, the employees, the manager, the
animations - runs off one delta scaled by `CONFIG.game.speedMultiplier`
(default `1.2`, where `1.0` is the original pace). Set it from the "Game
Speed" box in the main menu, or edit the default in `config.js`. The workday
still lasts `gameDurationMinutes` of game time, so at 1.2x it wraps up in
5/6ths of that in wall-clock minutes - which is what the HUD's "Real Time"
counts down.

## Layout

| file | what it does |
|---|---|
| `config.js` | every tunable in one object, plus the shared enums |
| `levels.js` | the levels themselves, as flat map text, and the code that reads it |
| `sprites.js` | sprite-pack loading and animation playback |
| `entities.js` | the manager and the employees, their AI and their drawing |
| `office.js` | floor plan, isometric projection, A* pathfinding, environment art |
| `camera.js` | the zoomed view that follows the boss around the office |
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

The view is a zoom on the boss rather than the whole floor plan - see
`CONFIG.camera` for the zoom level, how hard the camera pulls after him, and
how far ahead of him it looks.

Characters draw from sprite packs when one is assigned to them in
`CONFIG.sprites.actors`, and fall back to procedural pixel drawing otherwise.
`assets/sprites/README.md` covers adding a pack.

## Commissioning art

`docs/hiring-a-pixel-artist.md` is where to find a freelance pixel artist and
what to brief them with; `docs/artist-contract.md` is a fill-in-the-blanks
commission contract that matches the pack spec.
