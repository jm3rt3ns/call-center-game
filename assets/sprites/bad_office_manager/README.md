# Bad Office Manager — pixel-art animation set

48x48 px frames, transparent background, feet on y=45, character centred.
15 animations, one folder each. All frames drawn from the 24-colour palette in
`bad_office_manager.gpl` (import into Aseprite / GIMP / Pixelorama).

## Folder layout
```
01_idle/
  01_idle_00.png … 01_idle_05.png   individual frames
  01_idle_sheet.png                 horizontal strip (frames left→right, 48px cells)
  01_idle.json                      Aseprite "hash" JSON (frame rects + durations + tag)
  01_idle_preview.gif               4x preview to eyeball timing
… same for 02_walk … 15_die
ALL_animations_sheet.png            one row per animation, 48px grid (row = anim, col = frame)
ALL_animations_sheet_3x_preview.png
animations.json                     master index: frame count, ms per frame, fps, loop flag
godot/BadOfficeManager.tres         Godot 4 SpriteFrames resource (all 15 anims wired up)
bad_office_manager.gpl              palette
```

## Timing
| anim | frames | ms/frame | loop |
|---|---|---|---|
| 01_idle | 6 | 150 | yes |
| 02_walk | 8 | 110 | yes |
| 03_run | 8 | 70 | yes |
| 04_talk_gesture | 8 | 140 | yes |
| 05_angry_yell | 6 | 120 | yes |
| 06_slam_desk | 6 | 110 | no |
| 07_arms_crossed | 6 | 160 | yes |
| 08_walk_coffee | 8 | 110 | yes |
| 09_point_fire | 6 | 100 | no |
| 10_hit_react | 4 | 100 | no |
| 11_fall | 5 | 110 | no |
| 12_get_up | 4 | 120 | no |
| 13_victory_smug | 6 | 130 | yes |
| 14_interact_paperwork | 6 | 160 | no |
| 15_die | 6 | 130 | no |

## Importing
**Aseprite / LibreSprite** — `File > Import Sprite Sheet`, pick `<anim>_sheet.png`,
type Horizontal Strip, 48x48. Or `File > Import` the numbered PNGs (they sort
into frames automatically). The `.json` files use Aseprite's own export format,
so engines that read Aseprite JSON (Phaser, Godot importers, Unity Aseprite
importer) read them directly.

**Godot 4** — copy the whole folder to `res://sprites/bad_office_manager/` and
drop `godot/BadOfficeManager.tres` onto an `AnimatedSprite2D`'s `sprite_frames`.
Paths in the .tres assume that location; edit if you put it elsewhere.

**Unity** — import `ALL_animations_sheet.png` as Sprite (Multiple), Sprite Editor
> Slice > Grid by cell size 48x48, filter Point, compression None, PPU 48.
Row N = animation N in the table above.

**Pixelorama** — `File > Import` the numbered PNGs as frames, or the strip as a
spritesheet (48x48).

## Regenerating
`gen_sprites.py` draws every frame from a small pose table (arm/leg/head offsets,
face state, props). Change a keyframe, re-run, everything re-exports.
