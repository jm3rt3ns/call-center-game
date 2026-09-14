#!/usr/bin/env python3
"""Build the Bad Office Manager in Blender (bpy) and export him as glTF.

    python3 build.py                      # everything: model, bake, rig, animate, export, previews
    python3 build.py --stage model --render   # just the mesh and a turnaround
    python3 build.py --no-render          # skip the preview renders

Needs the `bpy` wheel (pip install bpy==4.2.*), Pillow and numpy.
"""

import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

from managerkit import anim, bake, body, export, materials, render, rig  # noqa: E402
from managerkit.measure import HEIGHT, J, Z_HEAD  # noqa: E402

OUT_DIR = os.path.normpath(os.path.join(HERE, ".."))
PREVIEW = os.path.join(OUT_DIR, "preview")
BVH_DIR = os.path.join(HERE, "mocap")
T0 = time.time()


def log(msg):
    print("[build %6.1fs] %s" % (time.time() - T0, msg), flush=True)


def place_mug(parts, arm, idle_action):
    """Parent the mug to the right hand so that, in the idle pose, it stands
    upright in the fist with the label facing forward."""
    mug = parts["Mug"]
    for mod in list(mug.modifiers):
        mug.modifiers.remove(mod)
    for vg in list(mug.vertex_groups):
        mug.vertex_groups.remove(vg)
    scene = bpy.context.scene
    arm.animation_data.action = idle_action
    scene.frame_set(1)
    bpy.context.view_layer.update()
    hand = arm.pose.bones["hand_R"]
    fist = arm.matrix_world @ (hand.head + (hand.tail - hand.head) * 0.55)
    # body of the mug just inboard of the fist, handle pointing at the fist
    loc = fist + Vector((0.07, -0.055, -0.035))
    world = Matrix.Translation(loc) @ Euler((0, 0, 1.5708), "XYZ").to_matrix().to_4x4()
    rig.parent_to_bone(mug, arm, "hand_R", world)
    mug["bone"] = "hand_R"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="all", choices=["model", "all"])
    ap.add_argument("--render", action="store_true", help="render previews (implied by --stage all)")
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--tmp", default=os.environ.get("MANAGER_TMP", "/tmp/manager_build"))
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--atlas", type=int, default=2048)
    ap.add_argument("--out", default=os.path.join(OUT_DIR, "bad_office_manager.glb"))
    args = ap.parse_args()
    os.makedirs(args.tmp, exist_ok=True)
    do_render = (args.render or args.stage == "all") and not args.no_render

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.render.fps = anim.FPS

    log("modelling")
    parts = body.build_all()
    log("materials")
    mats = materials.build_all(Z_HEAD)
    label = materials.make_label_image(os.path.join(args.tmp, "mug_label.png"))
    mats["mug"] = materials.mug(label)
    for o in parts.values():
        for i, slot in enumerate(o.material_slots):
            if slot.material and slot.material.name in mats:
                o.material_slots[i].material = mats[slot.material.name]
    log("parts: %s" % ", ".join("%s(%d)" % (o.name, len(o.data.polygons)) for o in parts.values()))
    log("total tris ~ %d" % sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts.values()))

    if args.stage == "model":
        if do_render:
            render.studio(scene, args.samples)
            render.turnaround(scene, os.path.join(args.tmp, "turnaround.png"), args.tmp, HEIGHT, samples=args.samples)
            render.closeup(scene, os.path.join(args.tmp, "closeup.png"), HEIGHT, samples=args.samples)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.tmp, "manager_model.blend"))
        log("done")
        return

    log("rig")
    arm = rig.build_armature()
    rig.skin_parts(parts, arm)

    log("join + unwrap")
    mug = parts.pop("Mug")
    lenses = parts.pop("Lenses")
    manager = bake.join_for_export(parts, arm)
    bake.unwrap(manager)
    log("bake atlas %d" % args.atlas)
    bake.bake_atlas(scene, manager, args.atlas, args.tmp)
    log("bake done: %d tris" % sum(len(p.vertices) - 2 for p in manager.data.polygons))

    log("animations")
    clips = anim.build_all(arm, BVH_DIR)
    place_mug({"Mug": mug}, arm, clips["idle"])
    log("clips: %s" % ", ".join("%s(%.2fs)" % (n, (a.frame_range[1] - a.frame_range[0]) / anim.FPS) for n, a in clips.items()))

    log("export")
    arm.animation_data.action = None
    export.export_glb(args.out, [arm, manager, lenses, mug])
    info = export.describe_glb(args.out)
    for k, v in info.items():
        log("  %s: %s" % (k, v))

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.tmp, "manager.blend"))
    if do_render:
        log("renders")
        os.makedirs(PREVIEW, exist_ok=True)
        render.studio(scene, args.samples)
        arm.animation_data.action = clips["idle"]
        scene.frame_set(1)
        render.turnaround(scene, os.path.join(PREVIEW, "turnaround.png"), args.tmp, HEIGHT, samples=args.samples)
        render.closeup(scene, os.path.join(PREVIEW, "closeup.png"), HEIGHT, samples=args.samples)
        render.animation_sheet(scene, arm, clips, os.path.join(PREVIEW, "animations.png"), args.tmp, HEIGHT,
                               samples=max(12, args.samples // 3))
    log("done")


if __name__ == "__main__":
    main()
    # bpy as a module can crash while tearing down its data at interpreter
    # exit, after all the work is done and saved; skip the teardown.
    sys.stdout.flush()
    os._exit(0)
