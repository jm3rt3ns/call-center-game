"""Studio lighting, cameras and contact-sheet renders (Cycles, CPU)."""

import math
import os

import bpy
from mathutils import Vector

BG = (0.0135, 0.0135, 0.0145)


def studio(scene, samples=48):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.image_settings.file_format = "PNG"
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*BG, 1)
    bg.inputs["Strength"].default_value = 1.0
    for o in [o for o in scene.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o)

    def light(name, kind, loc, energy, size=1.0, color=(1, 1, 1), target=(0, 0, 1.1)):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = color
        if kind == "AREA":
            data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        d = Vector(target) - Vector(loc)
        obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return obj

    light("key", "AREA", (-1.6, -2.4, 2.8), 260, size=1.6, color=(1.0, 0.96, 0.9))
    light("fill", "AREA", (2.4, -2.0, 1.6), 90, size=2.5, color=(0.85, 0.9, 1.0))
    light("rim", "AREA", (1.2, 2.6, 2.6), 200, size=1.0, color=(0.9, 0.95, 1.0))
    light("ground", "AREA", (0, -1.5, 0.2), 25, size=2.0, color=(1, 0.95, 0.9), target=(0, 0, 0.5))
    # floor catches the shadow
    if "Floor" not in scene.objects:
        bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
        floor = bpy.context.object
        floor.name = "Floor"
        m = bpy.data.materials.new("floor")
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.02, 0.02, 0.022, 1)
        b.inputs["Roughness"].default_value = 0.9
        floor.data.materials.append(m)
        floor["no_export"] = True


def camera(scene, name="Cam"):
    cam = scene.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        scene.collection.objects.link(cam)
    scene.camera = cam
    cam["no_export"] = True
    return cam


def aim(cam, loc, target, lens=70):
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "PERSP"
    cam.data.lens = lens


def render(scene, path, w, h):
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def turnaround(scene, out_png, tmpdir, height=1.85, w=440, h=900, samples=48, label=True):
    """Front, 3/4, side and back views, side by side like the concept sheet."""
    from PIL import Image, ImageDraw, ImageFont

    cam = camera(scene)
    scene.cycles.samples = samples
    target = (0, 0, height * 0.5)
    dist = 5.2
    shots = []
    for name, ang in (("front", 0), ("3/4", 40), ("side", 90), ("back", 180)):
        a = math.radians(ang)
        loc = (dist * math.sin(a) * -1, -dist * math.cos(a), height * 0.52)
        aim(cam, loc, target, lens=85)
        p = os.path.join(tmpdir, "turn_%s.png" % name.replace("/", ""))
        render(scene, p, w, h)
        shots.append((name, p))
    sheet = Image.new("RGB", (w * 4, h), tuple(int(c ** (1 / 2.2) * 255) for c in BG))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 18)
    for i, (name, p) in enumerate(shots):
        sheet.paste(Image.open(p), (i * w, 0))
        if label:
            d.text((i * w + 14, 12), name, font=font, fill=(200, 200, 200))
    sheet.save(out_png)
    return out_png


def closeup(scene, out_png, height=1.85, w=700, h=700, samples=64):
    cam = camera(scene)
    scene.cycles.samples = samples
    aim(cam, (-0.55, -1.15, height - 0.10), (0.0, 0.0, height - 0.16), lens=110)
    return render(scene, out_png, w, h)


def animation_sheet(scene, arm, clips, out_png, tmpdir, height=1.85, w=200, h=380, per_clip=5, samples=16):
    """A row per clip, sampled evenly through it."""
    from PIL import Image, ImageDraw, ImageFont

    cam = camera(scene)
    scene.cycles.samples = samples
    names = list(clips)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 16)
    sheet = Image.new("RGB", (w * per_clip + 150, h * len(names)), tuple(int(c ** (1 / 2.2) * 255) for c in BG))
    d = ImageDraw.Draw(sheet)
    for row, name in enumerate(names):
        act = clips[name]
        arm.animation_data.action = act
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        d.text((10, row * h + 12), name, font=font, fill=(220, 220, 220))
        for i in range(per_clip):
            f = f0 + int((f1 - f0) * i / max(1, per_clip - 1)) if not act.get("loop") else f0 + int((f1 - f0) * i / per_clip)
            scene.frame_set(f)
            aim(cam, (-2.6, -4.2, 1.5), (0, 0, height * 0.45), lens=60)
            p = os.path.join(tmpdir, "anim_%s_%d.png" % (name, i))
            render(scene, p, w, h)
            sheet.paste(Image.open(p), (150 + i * w, row * h))
            d.text((150 + i * w + 6, row * h + h - 22), "f%d" % f, font=font, fill=(160, 160, 160))
    sheet.save(out_png)
    return out_png
