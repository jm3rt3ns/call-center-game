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
| `sprites.js` | sprite-pack loading and animation playback |
| `entities.js` | the manager and the employees, their AI and their drawing |
| `office.js` | floor plan, isometric projection, A* pathfinding, environment art |
| `game.js` | game loop, win/lose rules, the render pass |
| `main.js` | menus, HUD, input, end screens |
| `sounds.js` | synthesised sound effects |
| `assets/sprites/` | character sprite packs - see its own README |

Characters draw from sprite packs when one is assigned to them in
`CONFIG.sprites.actors`, and fall back to procedural pixel drawing otherwise.
`assets/sprites/README.md` covers adding a pack.
