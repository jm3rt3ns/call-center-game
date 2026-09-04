# Sprite packs

Every character in the game draws from a **sprite pack**: a folder of horizontal
strip sheets plus a `pack.json` manifest. `sprites.js` loads them, `CONFIG.sprites`
decides which actor uses which pack, and anything without a pack falls back to
the procedural pixel drawing in `entities.js`.

```
assets/sprites/
  packs.json                  registry - lists every pack the game should load
  bad_office_manager/
    pack.json                 manifest (frame size, origin, animations, roles)
    01_idle/01_idle_sheet.png horizontal strip, one 48x48 cell per frame
    ...
```

## Adding a pack

1. Drop the folder in `assets/sprites/`.
2. Write a `pack.json` next to its sheets (format below).
3. Add one line to `packs.json`:
   ```json
   { "id": "grumpy_customer", "manifest": "grumpy_customer/pack.json" }
   ```
4. Point an actor at it in `config.js`:
   ```js
   CONFIG.sprites.actors.employee = 'grumpy_customer';
   ```

No code changes are needed for a pack that fills in the standard roles.

## pack.json

```json
{
  "id": "grumpy_customer",
  "name": "Grumpy Customer",
  "frameWidth": 48,
  "frameHeight": 48,
  "origin": { "x": 24, "y": 45 },
  "mirrorWhenFacingLeft": false,
  "defaultAnimation": "idle",
  "animations": {
    "idle": { "sheet": "01_idle/01_idle_sheet.png", "frames": 6, "frameMs": 150, "loop": true }
  },
  "roles": { "idle": "idle", "walk": "idle" }
}
```

| field | meaning |
|---|---|
| `frameWidth` / `frameHeight` | size of one cell in the strip |
| `origin` | anchor inside the frame, in pack pixels. The game positions sprites by this point, so put it where the feet touch the floor |
| `mirrorWhenFacingLeft` | `true` only for side-view art. Front-facing art should leave it `false`, otherwise ties and lanyards flip sides |
| `animations` | one entry per clip. `sheet` is relative to the manifest. Add `row` and `firstFrame` to carve several clips out of one multi-row sheet |
| `roles` | maps the game's roles onto this pack's animation names |

## Roles

The game never asks for an animation by name, only by role (`SPRITE_ROLE` in
`sprites.js`). A pack that is missing a role falls back to its
`defaultAnimation`, so a partial pack still works.

| role | when it plays |
|---|---|
| `idle` | standing still |
| `walk` | moving |
| `run` | moving at full speed |
| `work` | at a desk |
| `talk` | talking |
| `angry` | shouting - the manager's coffee dump |
| `slam` | slamming a desk - the manager's bathroom closure |
| `command` | ordering someone about - sending an employee back to their desk |
| `carry` | walking while carrying something |
| `wait` | idling with intent (arms crossed) |
| `hurt` | taking a hit |
| `fall` | going down |
| `getUp` | standing back up |
| `celebrate` | winning |
| `dead` | losing |

## bad_office_manager

48x48, 15 animations, 24-colour palette (`bad_office_manager.gpl`), feet on
row 45, front-facing. `gen_sprites.py` regenerates every frame from a pose
table; `animations.json` is the generator's own index and `pack.json` is the
game-facing manifest derived from it.
