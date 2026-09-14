"""Procedural materials for every wardrobe layer. They are authored with
object-space masks (so the mouth, brows and beard shadow land on the face
without hand painting) and then baked into one atlas by bake.py."""

import bpy
from mathutils import Vector

# sampled from docs/concept/bad-office-manager-concept-sheet.webp
COL = {
    "skin": (0.80, 0.55, 0.36),
    "skin_dark": (0.60, 0.36, 0.22),
    "lip": (0.55, 0.30, 0.24),
    "hair": (0.42, 0.26, 0.11),
    "brow": (0.30, 0.18, 0.08),
    "shirt": (0.56, 0.59, 0.72),
    "shirt_dark": (0.42, 0.45, 0.58),
    "collar": (0.90, 0.90, 0.92),
    "maroon": (0.36, 0.09, 0.09),
    "tie": (0.64, 0.45, 0.24),
    "tie_dark": (0.50, 0.34, 0.16),
    "slacks": (0.13, 0.14, 0.15),
    "slacks_dark": (0.09, 0.10, 0.11),
    "leather": (0.20, 0.12, 0.05),
    "shoe": (0.04, 0.04, 0.045),
    "frame": (0.06, 0.06, 0.07),
    "lens": (0.75, 0.85, 0.95),
    "brass": (0.82, 0.64, 0.30),
    "dial": (0.92, 0.90, 0.84),
    "eye": (0.95, 0.94, 0.92),
    "iris": (0.20, 0.30, 0.40),
    "pupil": (0.02, 0.02, 0.02),
    "pen": (0.10, 0.12, 0.35),
    "mug": (0.93, 0.90, 0.86),
}


def _srgb(c):
    """Colour values above are display sRGB; nodes want linear."""
    def f(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def _get(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt


def _basic(name, color, rough=0.6, metal=0.0, spec=0.5, sss=0.0):
    m, nt = _get(name)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = _srgb(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Specular IOR Level"].default_value = spec
    if sss:
        bsdf.inputs["Subsurface Weight"].default_value = sss
        bsdf.inputs["Subsurface Radius"].default_value = (0.02, 0.01, 0.005)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m, nt, bsdf


def _noise(nt, scale, detail=2.0, coords=None):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    if coords is not None:
        nt.links.new(coords, n.inputs["Vector"])
    return n


def _mix(nt, fac, a, b):
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = "MIX"
    if isinstance(fac, (int, float)):
        mx.inputs["Factor"].default_value = fac
    else:
        nt.links.new(fac, mx.inputs["Factor"])
    for sock, val in ((mx.inputs[6], a), (mx.inputs[7], b)):
        if isinstance(val, tuple):
            sock.default_value = val
        else:
            nt.links.new(val, sock)
    return mx


def _band(nt, value, lo, hi, soft=0.004):
    """1 inside [lo, hi] (soft edges), 0 outside; value is a socket."""
    a = nt.nodes.new("ShaderNodeMapRange")
    a.inputs["From Min"].default_value = lo - soft
    a.inputs["From Max"].default_value = lo + soft
    nt.links.new(value, a.inputs["Value"])
    b = nt.nodes.new("ShaderNodeMapRange")
    b.inputs["From Min"].default_value = hi + soft
    b.inputs["From Max"].default_value = hi - soft
    nt.links.new(value, b.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    nt.links.new(a.outputs["Result"], mul.inputs[0])
    nt.links.new(b.outputs["Result"], mul.inputs[1])
    return mul.outputs["Value"]


def _mul(nt, a, b):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = "MULTIPLY"
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs["Value"]


def _add(nt, a, b):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = "ADD"
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            m.inputs[i].default_value = v
        else:
            nt.links.new(v, m.inputs[i])
    return m.outputs["Value"]


def _absx(nt, sep):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = "ABSOLUTE"
    nt.links.new(sep.outputs["X"], m.inputs[0])
    return m.outputs["Value"]


def skin(head_z):
    """Skin with a mouth line and beard shadow, masked in object space."""
    from .measure import HEAD_PIVOT, HEAD_SCALE

    def hz(z):  # head-space height -> world, after the head scale
        return HEAD_PIVOT[2] + (z - HEAD_PIVOT[2]) * HEAD_SCALE

    m, nt, bsdf = _basic("skin", COL["skin"], rough=0.68, spec=0.35)
    tex = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tex.outputs["Object"], sep.inputs["Vector"])
    ax = _absx(nt, sep)
    # base tone with a faint blotchy variation
    n = _noise(nt, 18.0, 3.0, tex.outputs["Object"])
    var = _mix(nt, 0.10, _srgb(COL["skin"]), _srgb(COL["skin_dark"]))
    nt.links.new(n.outputs["Fac"], var.inputs["Factor"])
    base = _mix(nt, 0.35, _srgb(COL["skin"]), var.outputs[2])
    # beard shadow: lower face below the cheekbones, in front of the ears
    zc = head_z
    zb = _band(nt, sep.outputs["Z"], hz(zc - 0.13), hz(zc - 0.045), soft=0.02)
    yb = _band(nt, sep.outputs["Y"], -0.2, -0.045, soft=0.02)
    xb = _band(nt, ax, -1.0, 0.095 * HEAD_SCALE, soft=0.01)
    beard = _mul(nt, _mul(nt, zb, yb), xb)
    # spare the mouth block itself a little
    n2 = _noise(nt, 60.0, 2.0, tex.outputs["Object"])
    beard = _mul(nt, beard, _add(nt, _mul(nt, n2.outputs["Fac"], 0.5), 0.25))
    shaded = _mix(nt, beard, base.outputs[2], _srgb((0.62, 0.42, 0.30)))
    # mouth: a slightly down-turned line
    mz = _band(nt, sep.outputs["Z"], hz(zc - 0.111), hz(zc - 0.105), soft=0.0015)
    mx_ = _band(nt, ax, -1.0, 0.028 * HEAD_SCALE, soft=0.004)
    my = _band(nt, sep.outputs["Y"], -0.2, -0.08, soft=0.01)
    mouth = _mul(nt, _mul(nt, mz, mx_), my)
    lipped = _mix(nt, mouth, shaded.outputs[2], _srgb((0.42, 0.20, 0.16)))
    # lower lip highlight just under the line
    lz = _band(nt, sep.outputs["Z"], hz(zc - 0.123), hz(zc - 0.113), soft=0.003)
    lip = _mul(nt, _mul(nt, lz, mx_), my)
    lipped2 = _mix(nt, _mul(nt, lip, 0.6), lipped.outputs[2], _srgb(COL["lip"]))
    nt.links.new(lipped2.outputs[2], bsdf.inputs["Base Color"])
    return m


def cloth(name, color, dark, scale=220.0, rough=0.85, weave=0.12):
    m, nt, bsdf = _basic(name, color, rough=rough, spec=0.3)
    tex = nt.nodes.new("ShaderNodeTexCoord")
    n = _noise(nt, scale, 4.0, tex.outputs["Object"])
    mx = _mix(nt, weave, _srgb(color), _srgb(dark))
    nt.links.new(n.outputs["Fac"], mx.inputs["Factor"])
    nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    return m


def slacks():
    """Dark slacks with a faint vertical pinstripe."""
    m, nt, bsdf = _basic("slacks", COL["slacks"], rough=0.8, spec=0.3)
    tex = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tex.outputs["Object"], sep.inputs["Vector"])
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 90.0
    nt.links.new(tex.outputs["Object"], wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.85
    ramp.color_ramp.elements[1].position = 0.95
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    n = _noise(nt, 150.0, 3.0, tex.outputs["Object"])
    base = _mix(nt, 0.25, _srgb(COL["slacks"]), _srgb(COL["slacks_dark"]))
    nt.links.new(n.outputs["Fac"], base.inputs["Factor"])
    strip = _mix(nt, 0.35, base.outputs[2], _srgb((0.20, 0.21, 0.23)))
    nt.links.new(ramp.outputs["Color"], strip.inputs["Factor"])
    nt.links.new(strip.outputs[2], bsdf.inputs["Base Color"])
    return m


def tie():
    return cloth("tie", COL["tie"], COL["tie_dark"], scale=520.0, rough=0.5, weave=0.16)


def hair():
    m, nt, bsdf = _basic("hair", COL["hair"], rough=0.7)
    tex = nt.nodes.new("ShaderNodeTexCoord")
    n = _noise(nt, 120.0, 4.0, tex.outputs["Object"])
    mx = _mix(nt, 0.35, _srgb(COL["hair"]), _srgb(COL["brow"]))
    nt.links.new(n.outputs["Fac"], mx.inputs["Factor"])
    nt.links.new(mx.outputs[2], bsdf.inputs["Base Color"])
    return m


def mug(label_image):
    m, nt, bsdf = _basic("mug", COL["mug"], rough=0.25, spec=0.6)
    img = nt.nodes.new("ShaderNodeTexImage")
    img.image = label_image
    img.interpolation = "Linear"
    nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def lens():
    m, nt, bsdf = _basic("lens", COL["lens"], rough=0.05, spec=0.8)
    bsdf.inputs["Alpha"].default_value = 0.22
    m.blend_method = "BLEND"
    m.surface_render_method = "BLENDED"
    return m


def build_all(head_z):
    """(Re)create every material. Returns dict name -> material."""
    mats = {
        "skin": skin(head_z),
        "shirt": cloth("shirt", COL["shirt"], COL["shirt_dark"], scale=260.0, weave=0.18),
        "collar": cloth("collar", COL["collar"], (0.72, 0.72, 0.76), scale=260.0, weave=0.15),
        "maroon": cloth("maroon", COL["maroon"], (0.22, 0.05, 0.05), scale=300.0, rough=0.7, weave=0.25),
        "slacks": slacks(),
        "tie": tie(),
        "hair": hair(),
        "lens": lens(),
    }
    for name, kw in {
        "leather": dict(rough=0.45, spec=0.5),
        "shoe": dict(rough=0.4, spec=0.5),
        "frame": dict(rough=0.3, spec=0.6),
        "brass": dict(rough=0.3, metal=0.0, spec=0.9),
        "dial": dict(rough=0.3),
        "eye": dict(rough=0.2, spec=0.7),
        "iris": dict(rough=0.2),
        "pupil": dict(rough=0.2),
        "pen": dict(rough=0.3),
        "brow": dict(rough=0.8),
    }.items():
        mats[name] = _basic(name, COL[name], **kw)[0]
    return mats


def make_label_image(path):
    """Render the mug's NOT MY JOB print with PIL into a PNG and load it."""
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1024, 512
    im = Image.new("RGB", (W, H), (240, 232, 222))
    d = ImageDraw.Draw(im)
    # subtle ceramic tint band near the rim
    d.rectangle((0, 0, W, 26), fill=(226, 218, 208))
    font_big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 150)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 118)
    # the label sits on the side facing away from the handle (u ~ 0.25 is -Y side
    # in the mug's own frame; the handle is at +Y, u = 0.25 ... 0.75 wraps)
    cx = int(W * 0.5)
    for text, font, y in (("NOT", font_big, 110), ("MY JOB", font_small, 285)):
        bbox = d.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        d.text((cx - w / 2, y), text, font=font, fill=(28, 26, 28))
    im.save(path)
    img = bpy.data.images.load(path)
    img.name = "mug_label"
    return img
