#!/usr/bin/env python3
"""
Generate bad_office_manager.glb - the manager from docs/3d-game-spec.md as a
rigged, textured, animated glTF 2.0 binary.

Everything is built from scratch: no modelling package, no third-party library.
Geometry is flat-shaded convex solids (boxes and frusta), the texture is a
generated palette atlas embedded in the container, and the nine manager
animation roles are authored as joint rotation curves.

Spec constraints this file is written against (docs/3d-game-spec.md):

  SS4.3  1 tile = 0.8 m; manager collision capsule 0.55 m radius, 1.85 m tall
  SS9.1  stylised, clean geometry, strong silhouette, reads at isometric
         distance and holds up at first-person conversation distance
  SS9.3  manager needs idle / walk / run / angry / slam / command /
         celebrate / fall / dead, and a red palette accent
  SS9.3  reaction one-shots hold their final pose ~0.25 s

Proportions follow docs/concept/bad-office-manager-concept-sheet.webp: crew cut,
glasses, blue short-sleeve shirt, maroon suspenders, gold tie, dark slacks.

    python3 gen_manager_glb.py

Re-run after editing; the .glb is generated output and is committed.
"""

import json
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "bad_office_manager.glb")

# Spec SS4.3. The capsule is the collision volume, not the art bounds: the art
# must fit inside it or the manager clips through doorways he should pass.
TARGET_HEIGHT = 1.85
CAPSULE_RADIUS = 0.55


# --------------------------------------------------------------------------
# Palette
# --------------------------------------------------------------------------
# One atlas cell per material. Maroon is the spec's mandated red accent (SS9.3);
# it is carried by the suspenders, which is also the strongest silhouette line
# on the chest.

PALETTE = [
    ("skin",        (229, 181, 153)),
    ("skin_dark",   (206, 154, 124)),
    ("hair",        (150, 105,  55)),
    ("shirt",       (150, 170, 205)),
    ("shirt_dark",  (120, 138, 172)),
    ("collar",      (233, 237, 245)),
    ("maroon",      (124,  42,  46)),
    ("tie",         (170, 126,  48)),
    ("slacks",      ( 58,  62,  74)),
    ("slacks_dark", ( 44,  47,  57)),
    ("belt",        ( 30,  28,  33)),
    ("shoe",        ( 24,  25,  31)),
    ("frame",       ( 26,  26,  31)),
    ("lens",        (176, 205, 224)),
    ("watch",       (122,  88,  49)),
    ("mouth",       (120,  74,  62)),
]
CELL = {name: i for i, (name, _) in enumerate(PALETTE)}

ATLAS_COLS = 4
ATLAS_CELL_PX = 32
ATLAS_PX = ATLAS_COLS * ATLAS_CELL_PX  # 128x128


def build_atlas():
    """Palette atlas. Each cell is one flat colour with a slight vertical ramp,
    which reads as cheap ambient occlusion on every face that samples it."""
    rows = (len(PALETTE) + ATLAS_COLS - 1) // ATLAS_COLS
    height = rows * ATLAS_CELL_PX
    px = bytearray(ATLAS_PX * height * 4)
    for idx, (_, rgb) in enumerate(PALETTE):
        cx = (idx % ATLAS_COLS) * ATLAS_CELL_PX
        cy = (idx // ATLAS_COLS) * ATLAS_CELL_PX
        for y in range(ATLAS_CELL_PX):
            # +6% at the top of the cell down to -8% at the bottom.
            t = y / (ATLAS_CELL_PX - 1.0)
            k = 1.06 - 0.14 * t
            r = max(0, min(255, int(rgb[0] * k)))
            g = max(0, min(255, int(rgb[1] * k)))
            b = max(0, min(255, int(rgb[2] * k)))
            for x in range(ATLAS_CELL_PX):
                o = ((cy + y) * ATLAS_PX + (cx + x)) * 4
                px[o : o + 4] = bytes((r, g, b, 255))
    return bytes(px), ATLAS_PX, height


def encode_png(width, height, rgba):
    raw = b"".join(
        b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height)
    )

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def cell_uv(name):
    """Inner rect of a cell. Inset hard so mip filtering never bleeds a
    neighbouring colour across an edge."""
    idx = CELL[name]
    rows = (len(PALETTE) + ATLAS_COLS - 1) // ATLAS_COLS
    u0 = (idx % ATLAS_COLS) / ATLAS_COLS
    v0 = (idx // ATLAS_COLS) / rows
    du = 1.0 / ATLAS_COLS
    dv = 1.0 / rows
    return (u0 + du * 0.25, v0 + dv * 0.25, u0 + du * 0.75, v0 + dv * 0.75)


# --------------------------------------------------------------------------
# Maths
# --------------------------------------------------------------------------

def quat_axis(axis, deg):
    a = math.radians(deg) * 0.5
    s = math.sin(a)
    return (axis[0] * s, axis[1] * s, axis[2] * s, math.cos(a))


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def euler_quat(rx, ry, rz):
    """Degrees, applied X then Y then Z."""
    q = quat_mul(quat_axis((0, 0, 1), rz), quat_axis((0, 1, 0), ry))
    return quat_mul(q, quat_axis((1, 0, 0), rx))


def normalize(v):
    n = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / n for c in v)


# --------------------------------------------------------------------------
# Skeleton
# --------------------------------------------------------------------------
# World-space rest positions. Bind pose has identity rotation everywhere, which
# makes every inverse bind matrix a pure inverse translation.
#
# +X is the character's left, +Y is up, and he faces -Z.

JOINTS = [
    ("root",        None,         (0.000, 0.000, 0.000)),
    ("hips",        "root",       (0.000, 0.950, 0.000)),
    ("spine",       "hips",       (0.000, 1.105, 0.000)),
    ("chest",       "spine",      (0.000, 1.300, 0.000)),
    ("neck",        "chest",      (0.000, 1.520, 0.000)),
    ("head",        "neck",       (0.000, 1.600, 0.000)),
    ("clav_L",      "chest",      (0.105, 1.455, 0.000)),
    ("upperarm_L",  "clav_L",     (0.300, 1.440, 0.000)),
    ("forearm_L",   "upperarm_L", (0.352, 1.140, 0.000)),
    ("hand_L",      "forearm_L",  (0.398, 0.880, 0.000)),
    ("clav_R",      "chest",      (-0.105, 1.455, 0.000)),
    ("upperarm_R",  "clav_R",     (-0.300, 1.440, 0.000)),
    ("forearm_R",   "upperarm_R", (-0.352, 1.140, 0.000)),
    ("hand_R",      "forearm_R",  (-0.398, 0.880, 0.000)),
    ("thigh_L",     "hips",       (0.132, 0.930, 0.000)),
    ("shin_L",      "thigh_L",    (0.140, 0.510, 0.000)),
    ("foot_L",      "shin_L",     (0.140, 0.105, 0.000)),
    ("thigh_R",     "hips",       (-0.132, 0.930, 0.000)),
    ("shin_R",      "thigh_R",    (-0.140, 0.510, 0.000)),
    ("foot_R",      "shin_R",     (-0.140, 0.105, 0.000)),
]
JOINT_INDEX = {name: i for i, (name, _, _) in enumerate(JOINTS)}
JOINT_POS = {name: pos for name, _, pos in JOINTS}


# --------------------------------------------------------------------------
# Mesh
# --------------------------------------------------------------------------

class Mesh:
    def __init__(self):
        self.pos = []
        self.nrm = []
        self.uv = []
        self.jnt = []
        self.wgt = []
        self.idx = []

    def solid(self, corners, joint, colour):
        """corners: 8 points, bottom ring 0-3 then top ring 4-7, each ring
        ordered (-x,-z) (+x,-z) (+x,+z) (-x,+z). Bound rigidly to one joint;
        parts overlap at the joints so rotation never opens a seam."""
        ji = JOINT_INDEX[joint]
        u0, v0, u1, v1 = cell_uv(colour)
        centre = tuple(sum(c[i] for c in corners) / 8.0 for i in range(3))
        faces = [
            (1, 2, 6, 5),
            (3, 0, 4, 7),
            (2, 3, 7, 6),
            (0, 1, 5, 4),
            (4, 5, 6, 7),
            (3, 2, 1, 0),
        ]
        for face in faces:
            v = [corners[i] for i in face]
            e1 = tuple(v[1][i] - v[0][i] for i in range(3))
            e2 = tuple(v[2][i] - v[0][i] for i in range(3))
            n = normalize((
                e1[1] * e2[2] - e1[2] * e2[1],
                e1[2] * e2[0] - e1[0] * e2[2],
                e1[0] * e2[1] - e1[1] * e2[0],
            ))
            fc = tuple(sum(p[i] for p in v) / 4.0 for i in range(3))
            if sum(n[i] * (fc[i] - centre[i]) for i in range(3)) < 0:
                v = v[::-1]
                n = tuple(-c for c in n)
            base = len(self.pos)
            for p, uv in zip(v, ((u0, v1), (u1, v1), (u1, v0), (u0, v0))):
                self.pos.append(p)
                self.nrm.append(n)
                self.uv.append(uv)
                self.jnt.append((ji, 0, 0, 0))
                self.wgt.append((1.0, 0.0, 0.0, 0.0))
            self.idx += [base, base + 1, base + 2, base, base + 2, base + 3]

    def box(self, joint, colour, x, y, z):
        """Axis-aligned box from (x0,x1),(y0,y1),(z0,z1) ranges."""
        self.frustum(joint, colour, y, x, z, x, z)

    def frustum(self, joint, colour, y, xb, zb, xt, zt):
        """Box with independent bottom and top footprints - the whole character
        is built from these, which is what gives the taper on the torso."""
        y0, y1 = y
        c = [
            (xb[0], y0, zb[0]), (xb[1], y0, zb[0]),
            (xb[1], y0, zb[1]), (xb[0], y0, zb[1]),
            (xt[0], y1, zt[0]), (xt[1], y1, zt[0]),
            (xt[1], y1, zt[1]), (xt[0], y1, zt[1]),
        ]
        self.solid(c, joint, colour)


def build_body():
    m = Mesh()

    # Feet. Blocky and slightly oversized - they anchor the silhouette and stop
    # the legs reading as sticks under the mass above.
    for side, sx in (("L", 1), ("R", -1)):
        j = "foot_%s" % side
        m.box(j, "shoe", (sx * 0.055, sx * 0.215), (0.000, 0.082), (-0.175, 0.085))
        m.box(j, "shoe", (sx * 0.062, sx * 0.208), (0.082, 0.125), (-0.090, 0.080))

    # Legs. Slacks, heavy through the thigh, breaking over the shoe.
    for side, sx in (("L", 1), ("R", -1)):
        m.frustum("shin_%s" % side, "slacks", (0.105, 0.545),
                  (sx * 0.058, sx * 0.212), (-0.098, 0.098),
                  (sx * 0.052, sx * 0.225), (-0.105, 0.105))
        m.frustum("thigh_%s" % side, "slacks", (0.520, 0.960),
                  (sx * 0.050, sx * 0.228), (-0.108, 0.108),
                  (sx * 0.012, sx * 0.250), (-0.125, 0.130))

    # Hips and belt.
    m.frustum("hips", "slacks", (0.880, 1.055),
              (-0.205, 0.205), (-0.140, 0.140),
              (-0.220, 0.220), (-0.150, 0.150))
    m.box("hips", "belt", (-0.226, 0.226), (1.055, 1.098), (-0.156, 0.156))

    # Torso. The V: a 0.43 m waist opening out to a 0.64 m chest, and a chest
    # that is genuinely deep front-to-back rather than a slab. Everything about
    # "he must look heavy" (SS9.3) lives in this taper, the traps, and the
    # deltoids below.
    m.frustum("spine", "shirt", (1.090, 1.300),
              (-0.215, 0.215), (-0.150, 0.150),
              (-0.250, 0.250), (-0.190, 0.190))
    m.frustum("chest", "shirt", (1.295, 1.500),
              (-0.250, 0.250), (-0.190, 0.190),
              (-0.320, 0.320), (-0.205, 0.205))
    # Pectoral shelf, sitting proud of the shirt front.
    m.frustum("chest", "shirt_dark", (1.325, 1.470),
              (-0.240, 0.240), (-0.238, -0.185),
              (-0.275, 0.275), (-0.228, -0.185))
    # Traps. The slope from ear to shoulder is the single strongest "heavy"
    # cue there is - without it the deltoids just read as shoulder pads.
    m.frustum("chest", "shirt", (1.420, 1.498),
              (-0.268, 0.268), (-0.180, 0.180),
              (-0.118, 0.118), (-0.132, 0.132))

    # Collar and tie. Both have to track the body's Z taper: the torso is 4 cm
    # deeper at the shoulders than at the waist, and anything laid on the front
    # at a constant Z floats off the chest at one end.
    m.frustum("chest", "collar", (1.487, 1.545),
              (-0.128, 0.128), (-0.200, 0.200),
              (-0.100, 0.100), (-0.162, 0.162))
    m.box("chest", "tie", (-0.038, 0.038), (1.468, 1.514), (-0.244, -0.220))
    m.frustum("chest", "tie", (1.300, 1.472),
              (-0.052, 0.052), (-0.250, -0.234),
              (-0.034, 0.034), (-0.242, -0.226))
    m.frustum("spine", "tie", (1.150, 1.302),
              (-0.040, 0.040), (-0.175, -0.161),
              (-0.052, 0.052), (-0.204, -0.190))

    # Suspenders - the spec's red accent (SS9.3), and the line that makes the
    # torso read instantly from isometric distance. Narrow: at strap width they
    # draw the eye to the chest taper; any wider and they flatten it into a bib.
    def strap(joint, y, xa, xb, za, zb):
        """A strap segment. x and z are interpolated independently at each end,
        so a strap can lean across the back as well as follow the body's taper."""
        m.frustum(joint, "maroon", y, xa, za, xb, zb)

    def lerp(a, b, t):
        return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))

    for sx in (1, -1):
        # Front: up the waist, then over the pec shelf, which stands ~3 cm
        # proud of the shirt. The strap stops at the top of the pec and is
        # covered by the traps from there, the way a real strap disappears
        # over the shoulder.
        strap("spine", (1.090, 1.302),
              (sx * 0.086, sx * 0.132), (sx * 0.098, sx * 0.144),
              (-0.164, -0.150), (-0.204, -0.190))
        strap("chest", (1.300, 1.474),
              (sx * 0.098, sx * 0.144), (sx * 0.110, sx * 0.156),
              (-0.252, -0.238), (-0.242, -0.228))

    # Back: they cross, the way real X-backs do. Each strap runs from the
    # opposite hip to the shoulder, so the two make an X over the spine.
    for sx in (1, -1):
        hip_x = (sx * -0.070, sx * -0.020)
        top_x = (sx * 0.104, sx * 0.150)
        mid_x = lerp(hip_x, top_x, (1.300 - 1.090) / (1.500 - 1.090))
        strap("spine", (1.090, 1.300), hip_x, mid_x, (0.156, 0.170), (0.196, 0.210))
        strap("chest", (1.300, 1.500), mid_x, top_x, (0.196, 0.210), (0.211, 0.225))

    # Neck: short and thick, so the head sits *on* the traps rather than above
    # them. Cheapest possible way to say "heavy".
    # Deliberately narrower than the jaw above it. When the neck matches the
    # head's width the two merge into one long slab and he loses a chin.
    m.frustum("neck", "skin", (1.470, 1.585),
              (-0.078, 0.078), (-0.076, 0.076),
              (-0.070, 0.070), (-0.070, 0.070))

    # Head, hair, glasses.
    m.frustum("head", "skin", (1.580, 1.800),
              (-0.112, 0.112), (-0.098, 0.102),
              (-0.118, 0.118), (-0.102, 0.106))
    m.frustum("head", "skin_dark", (1.600, 1.652),
              (-0.104, 0.104), (-0.114, -0.096),
              (-0.108, 0.108), (-0.114, -0.096))   # brow ridge
    m.box("head", "mouth", (-0.038, 0.038), (1.634, 1.650), (-0.112, -0.102))
    m.frustum("head", "hair", (1.782, 1.850),
              (-0.118, 0.118), (-0.102, 0.106),
              (-0.098, 0.098), (-0.084, 0.090))    # crew cut
    for sx in (1, -1):
        m.box("head", "hair",
              (sx * 0.106, sx * 0.124), (1.690, 1.792), (-0.088, 0.094))
    m.box("head", "hair", (-0.120, 0.120), (1.690, 1.792), (0.090, 0.108))
    # Glasses: bridge plus two lenses, standing off the face so they catch light.
    m.box("head", "frame", (-0.030, 0.030), (1.706, 1.722), (-0.116, -0.106))
    for sx in (1, -1):
        m.box("head", "lens",
              (sx * 0.030, sx * 0.100), (1.694, 1.738), (-0.118, -0.108))
        m.box("head", "frame",
              (sx * 0.096, sx * 0.116), (1.700, 1.732), (-0.116, -0.098))

    # Deltoids. The widest thing on him and the first thing the player reads
    # from any angle. They run out past the chest and hang low enough to meet
    # the bicep, so the shoulder never breaks into two separate blocks.
    for side, sx in (("L", 1), ("R", -1)):
        m.frustum("clav_%s" % side, "shirt", (1.300, 1.522),
                  (sx * 0.150, sx * 0.432), (-0.186, 0.186),
                  (sx * 0.130, sx * 0.372), (-0.150, 0.150))

    # Arms. Short sleeve ends just below the deltoid, so the bare arm carries
    # the rest - it has to read at conversation distance (SS9.1). Every segment
    # overlaps the next by 3-5 cm: rigid skinning means a gap at a joint would
    # open into a visible hole the moment the elbow bends.
    for side, sx in (("L", 1), ("R", -1)):
        m.frustum("upperarm_%s" % side, "skin", (1.085, 1.395),
                  (sx * 0.232, sx * 0.446), (-0.145, 0.145),
                  (sx * 0.222, sx * 0.428), (-0.158, 0.158))
        m.frustum("forearm_%s" % side, "skin", (0.845, 1.145),
                  (sx * 0.300, sx * 0.458), (-0.098, 0.098),
                  (sx * 0.252, sx * 0.442), (-0.132, 0.132))
        m.frustum("hand_%s" % side, "skin", (0.712, 0.898),
                  (sx * 0.336, sx * 0.456), (-0.078, 0.078),
                  (sx * 0.320, sx * 0.452), (-0.092, 0.092))
    # Watch on the left wrist, per the concept sheet. Sits just proud of the
    # forearm rather than replacing a slice of it, so it reads as a band.
    m.frustum("forearm_L", "watch", (0.902, 0.940),
              (0.306, 0.462), (-0.104, 0.104),
              (0.302, 0.462), (-0.108, 0.108))

    return m


# --------------------------------------------------------------------------
# Animation
# --------------------------------------------------------------------------
# Each clip is joint rotation curves in degrees, plus optional root translation.
# Times are seconds. Loops repeat the t=0 pose at t=duration.

HOLD = 0.25  # SS9.3: one-shots hold their final pose before locomotion resumes


def clips():
    out = []

    # -- idle -------------------------------------------------------------
    # Breathing, a slow weight shift, and arms that cannot hang straight.
    out.append(dict(name="idle", duration=2.6, loop=True, rot={
        "chest":      [(0.0, (-1.5, 0, 0)), (1.3, (1.5, 0, 0)), (2.6, (-1.5, 0, 0))],
        "spine":      [(0.0, (0, 2, 0)), (1.3, (0, -2, 0)), (2.6, (0, 2, 0))],
        "head":       [(0.0, (0, -4, 0)), (0.9, (2, 3, 0)), (1.8, (0, 1, 0)), (2.6, (0, -4, 0))],
        "upperarm_L": [(0.0, (0, 0, 7)), (1.3, (0, 0, 10)), (2.6, (0, 0, 7))],
        "upperarm_R": [(0.0, (0, 0, -7)), (1.3, (0, 0, -10)), (2.6, (0, 0, -7))],
        "forearm_L":  [(0.0, (0, 0, 4)), (1.3, (0, 0, 7)), (2.6, (0, 0, 4))],
        "forearm_R":  [(0.0, (0, 0, -4)), (1.3, (0, 0, -7)), (2.6, (0, 0, -4))],
    }, pos={"root": [(0.0, (0, 0, 0)), (1.3, (0, -0.012, 0)), (2.6, (0, 0, 0))]}))

    # -- walk -------------------------------------------------------------
    # 1.0 s cycle. Deliberate and top-heavy: short stride, big counter-rotation.
    out.append(dict(name="walk", duration=1.0, loop=True, rot={
        "thigh_L":    [(0.0, (24, 0, 0)), (0.5, (-20, 0, 0)), (1.0, (24, 0, 0))],
        "thigh_R":    [(0.0, (-20, 0, 0)), (0.5, (24, 0, 0)), (1.0, (-20, 0, 0))],
        "shin_L":     [(0.0, (-6, 0, 0)), (0.25, (-34, 0, 0)), (0.5, (-4, 0, 0)), (0.75, (-10, 0, 0)), (1.0, (-6, 0, 0))],
        "shin_R":     [(0.0, (-4, 0, 0)), (0.25, (-10, 0, 0)), (0.5, (-6, 0, 0)), (0.75, (-34, 0, 0)), (1.0, (-4, 0, 0))],
        "foot_L":     [(0.0, (-10, 0, 0)), (0.5, (8, 0, 0)), (1.0, (-10, 0, 0))],
        "foot_R":     [(0.0, (8, 0, 0)), (0.5, (-10, 0, 0)), (1.0, (8, 0, 0))],
        "hips":       [(0.0, (0, -5, 0)), (0.5, (0, 5, 0)), (1.0, (0, -5, 0))],
        "chest":      [(0.0, (2, 5, 0)), (0.5, (2, -5, 0)), (1.0, (2, 5, 0))],
        "upperarm_L": [(0.0, (-16, 0, 8)), (0.5, (16, 0, 8)), (1.0, (-16, 0, 8))],
        "upperarm_R": [(0.0, (16, 0, -8)), (0.5, (-16, 0, -8)), (1.0, (16, 0, -8))],
        "forearm_L":  [(0.0, (-20, 0, 5)), (0.5, (-8, 0, 5)), (1.0, (-20, 0, 5))],
        "forearm_R":  [(0.0, (-8, 0, -5)), (0.5, (-20, 0, -5)), (1.0, (-8, 0, -5))],
    }, pos={"root": [(0.0, (0, 0.0, 0)), (0.25, (0, 0.022, 0)), (0.5, (0, 0.0, 0)),
                     (0.75, (0, 0.022, 0)), (1.0, (0, 0.0, 0))]}))

    # -- run --------------------------------------------------------------
    # 0.62 s cycle, forward lean, much bigger knee break.
    out.append(dict(name="run", duration=0.62, loop=True, rot={
        "thigh_L":    [(0.0, (46, 0, 0)), (0.31, (-34, 0, 0)), (0.62, (46, 0, 0))],
        "thigh_R":    [(0.0, (-34, 0, 0)), (0.31, (46, 0, 0)), (0.62, (-34, 0, 0))],
        "shin_L":     [(0.0, (-30, 0, 0)), (0.155, (-76, 0, 0)), (0.31, (-8, 0, 0)), (0.465, (-26, 0, 0)), (0.62, (-30, 0, 0))],
        "shin_R":     [(0.0, (-8, 0, 0)), (0.155, (-26, 0, 0)), (0.31, (-30, 0, 0)), (0.465, (-76, 0, 0)), (0.62, (-8, 0, 0))],
        "foot_L":     [(0.0, (-16, 0, 0)), (0.31, (14, 0, 0)), (0.62, (-16, 0, 0))],
        "foot_R":     [(0.0, (14, 0, 0)), (0.31, (-16, 0, 0)), (0.62, (14, 0, 0))],
        "hips":       [(0.0, (6, -8, 0)), (0.31, (6, 8, 0)), (0.62, (6, -8, 0))],
        "spine":      [(0.0, (7, 0, 0)), (0.62, (7, 0, 0))],
        "chest":      [(0.0, (6, 9, 0)), (0.31, (6, -9, 0)), (0.62, (6, 9, 0))],
        "upperarm_L": [(0.0, (-46, 0, 12)), (0.31, (38, 0, 12)), (0.62, (-46, 0, 12))],
        "upperarm_R": [(0.0, (38, 0, -12)), (0.31, (-46, 0, -12)), (0.62, (38, 0, -12))],
        "forearm_L":  [(0.0, (-62, 0, 6)), (0.31, (-40, 0, 6)), (0.62, (-62, 0, 6))],
        "forearm_R":  [(0.0, (-40, 0, -6)), (0.31, (-62, 0, -6)), (0.62, (-40, 0, -6))],
        "head":       [(0.0, (-5, 0, 0)), (0.62, (-5, 0, 0))],
    }, pos={"root": [(0.0, (0, 0.0, 0)), (0.155, (0, 0.05, 0)), (0.31, (0, 0.0, 0)),
                     (0.465, (0, 0.05, 0)), (0.62, (0, 0.0, 0))]}))

    # -- angry ------------------------------------------------------------
    # Dumping the coffee pot: reach forward, tip it out, stay leaning over it.
    # Positive X on an arm joint swings it forward (-Z), which is the direction
    # he faces - the pot is in front of him, not behind.
    out.append(dict(name="angry", duration=1.30 + HOLD, loop=False, rot={
        "upperarm_R": [(0.0, (0, 0, -7)), (0.28, (74, 0, -24)), (0.58, (88, 0, -38)),
                       (0.84, (66, 0, -26)), (1.30, (62, 0, -24)), (1.55, (62, 0, -24))],
        "forearm_R":  [(0.0, (0, 0, -4)), (0.28, (-22, 0, -10)), (0.58, (-14, -34, -10)),
                       (0.84, (-26, -12, -8)), (1.30, (-24, -10, -8)), (1.55, (-24, -10, -8))],
        "hand_R":     [(0.0, (0, 0, 0)), (0.58, (0, -54, 0)), (0.84, (0, -34, 0)),
                       (1.55, (0, -32, 0))],
        "spine":      [(0.0, (0, 0, 0)), (0.58, (12, -14, 0)), (1.30, (14, -12, 0)), (1.55, (14, -12, 0))],
        "chest":      [(0.0, (0, 0, 0)), (0.58, (8, -10, 0)), (1.55, (9, -9, 0))],
        "head":       [(0.0, (0, 0, 0)), (0.58, (14, -12, 0)), (1.55, (12, -10, 0))],
        "upperarm_L": [(0.0, (0, 0, 7)), (0.58, (18, 0, 16)), (1.55, (14, 0, 14))],
    }))

    # -- slam -------------------------------------------------------------
    # Closing the bathroom: arm up over the shoulder, whole body behind it.
    out.append(dict(name="slam", duration=0.95 + HOLD, loop=False, rot={
        "upperarm_R": [(0.0, (0, 0, -7)), (0.26, (150, 0, -18)), (0.40, (44, 0, -10)),
                       (0.60, (52, 0, -10)), (0.95, (10, 0, -8)), (1.20, (10, 0, -8))],
        "forearm_R":  [(0.0, (0, 0, -4)), (0.26, (-34, 0, -6)), (0.40, (-6, 0, -4)),
                       (1.20, (-8, 0, -4))],
        "spine":      [(0.0, (0, 0, 0)), (0.26, (-10, 0, 0)), (0.40, (20, 0, 0)),
                       (0.60, (17, 0, 0)), (1.20, (2, 0, 0))],
        "chest":      [(0.0, (0, 0, 0)), (0.26, (-6, 0, 0)), (0.40, (12, 0, 0)), (1.20, (1, 0, 0))],
        "head":       [(0.0, (0, 0, 0)), (0.26, (-12, 0, 0)), (0.40, (16, 0, 0)), (1.20, (2, 0, 0))],
        "thigh_L":    [(0.0, (0, 0, 0)), (0.40, (-16, 0, 0)), (0.60, (-14, 0, 0)), (1.20, (0, 0, 0))],
        "thigh_R":    [(0.0, (0, 0, 0)), (0.40, (-16, 0, 0)), (0.60, (-14, 0, 0)), (1.20, (0, 0, 0))],
        "shin_L":     [(0.0, (0, 0, 0)), (0.40, (22, 0, 0)), (1.20, (0, 0, 0))],
        "shin_R":     [(0.0, (0, 0, 0)), (0.40, (22, 0, 0)), (1.20, (0, 0, 0))],
        "upperarm_L": [(0.0, (0, 0, 7)), (0.40, (-18, 0, 20)), (1.20, (0, 0, 8))],
    }, pos={"root": [(0.0, (0, 0, 0)), (0.26, (0, 0.03, 0)), (0.40, (0, -0.05, 0)),
                     (0.60, (0, -0.04, 0)), (1.20, (0, 0, 0))]}))

    # -- command ----------------------------------------------------------
    # "Back to your desk." Arm straight out, held, then dropped.
    out.append(dict(name="command", duration=1.05 + HOLD, loop=False, rot={
        "upperarm_R": [(0.0, (0, 0, -7)), (0.20, (44, 0, -22)), (0.34, (92, 0, -12)),
                       (0.50, (86, 0, -10)), (1.05, (84, 0, -10)), (1.30, (84, 0, -10))],
        "forearm_R":  [(0.0, (0, 0, -4)), (0.34, (-8, 0, -2)), (1.30, (-6, 0, -2))],
        "hand_R":     [(0.0, (0, 0, 0)), (0.34, (0, 0, -8)), (1.30, (0, 0, -8))],
        "chest":      [(0.0, (0, 0, 0)), (0.34, (0, -12, 0)), (1.30, (0, -11, 0))],
        "spine":      [(0.0, (0, 0, 0)), (0.34, (4, -6, 0)), (1.30, (4, -6, 0))],
        "head":       [(0.0, (0, 0, 0)), (0.34, (2, -14, 0)), (1.30, (2, -13, 0))],
        "upperarm_L": [(0.0, (0, 0, 7)), (0.34, (-10, 0, 12)), (1.30, (-8, 0, 11))],
    }))

    # -- celebrate --------------------------------------------------------
    # Smug double-biceps. Loops, because it plays under the win screen.
    out.append(dict(name="celebrate", duration=1.8, loop=True, rot={
        "upperarm_L": [(0.0, (0, 0, 96)), (0.9, (0, 0, 104)), (1.8, (0, 0, 96))],
        "upperarm_R": [(0.0, (0, 0, -96)), (0.9, (0, 0, -104)), (1.8, (0, 0, -96))],
        "forearm_L":  [(0.0, (0, -20, 84)), (0.9, (0, -20, 96)), (1.8, (0, -20, 84))],
        "forearm_R":  [(0.0, (0, 20, -84)), (0.9, (0, 20, -96)), (1.8, (0, 20, -84))],
        "chest":      [(0.0, (-6, 0, 0)), (0.9, (-9, 0, 0)), (1.8, (-6, 0, 0))],
        "spine":      [(0.0, (-3, 0, 0)), (0.9, (-5, 0, 0)), (1.8, (-3, 0, 0))],
        "head":       [(0.0, (-4, 8, 0)), (0.9, (-6, 6, 0)), (1.8, (-4, 8, 0))],
        "thigh_L":    [(0.0, (0, 0, 5)), (1.8, (0, 0, 5))],
        "thigh_R":    [(0.0, (0, 0, -5)), (1.8, (0, 0, -5))],
    }, pos={"root": [(0.0, (0, 0, 0)), (0.9, (0, 0.018, 0)), (1.8, (0, 0, 0))]}))

    # -- fall -------------------------------------------------------------
    # Missed the target. Staggers back, sits down hard, goes flat.
    out.append(dict(name="fall", duration=1.25 + HOLD, loop=False, rot={
        "spine":      [(0.0, (0, 0, 0)), (0.22, (-16, 0, 0)), (0.62, (6, 0, 0)), (1.25, (10, 0, 0)), (1.50, (10, 0, 0))],
        "chest":      [(0.0, (0, 0, 0)), (0.22, (-12, 0, 0)), (0.62, (8, 0, 0)), (1.50, (12, 0, 0))],
        # Ends on dead's first frame exactly, head yaw included, so the two
        # clips chain without a pop.
        "head":       [(0.0, (0, 0, 0)), (0.22, (-18, 0, 0)), (0.70, (22, -4, 0)), (1.50, (16, -10, 0))],
        "upperarm_L": [(0.0, (0, 0, 7)), (0.30, (-54, 0, 42)), (0.80, (-16, 0, 62)), (1.50, (-8, 0, 66))],
        "upperarm_R": [(0.0, (0, 0, -7)), (0.30, (-54, 0, -42)), (0.80, (-16, 0, -62)), (1.50, (-8, 0, -66))],
        "forearm_L":  [(0.0, (0, 0, 4)), (0.30, (-40, 0, 10)), (1.50, (-14, 0, 12))],
        "forearm_R":  [(0.0, (0, 0, -4)), (0.30, (-40, 0, -10)), (1.50, (-14, 0, -12))],
        "thigh_L":    [(0.0, (0, 0, 0)), (0.42, (-18, 0, 8)), (0.90, (-16, 0, 13)), (1.50, (-14, 0, 14))],
        "thigh_R":    [(0.0, (0, 0, 0)), (0.42, (-18, 0, -8)), (0.90, (-16, 0, -13)), (1.50, (-14, 0, -14))],
        "shin_L":     [(0.0, (0, 0, 0)), (0.42, (26, 0, 0)), (0.90, (22, 0, 0)), (1.50, (20, 0, 0))],
        "shin_R":     [(0.0, (0, 0, 0)), (0.42, (26, 0, 0)), (0.90, (22, 0, 0)), (1.50, (20, 0, 0))],
        # The root sits between the feet on the floor, so rotating it 90 degrees
        # about X already lays him flat on his back - he pivots over his heels.
        # The only translation needed is *up* by half his body depth, otherwise
        # his back ends up buried in the floor.
        "root":       [(0.0, (0, 0, 0)), (0.30, (-6, 0, 0)), (0.72, (48, 0, 0)), (1.05, (86, 0, 0)), (1.25, (90, 0, 0)), (1.50, (90, 0, 0))],
    }, pos={"root": [(0.0, (0, 0.0, 0.0)), (0.30, (0, 0.0, 0.03)), (0.72, (0, 0.14, 0.06)),
                     (1.05, (0, 0.19, 0.08)), (1.25, (0, 0.19, 0.08)), (1.50, (0, 0.19, 0.08))]}))

    # -- dead -------------------------------------------------------------
    # An employee snapped. Flat on his back, one hand still twitching.
    flat_root = (90, 0, 0)
    flat_pos = (0, 0.19, 0.08)
    out.append(dict(name="dead", duration=3.0, loop=True, rot={
        "root":       [(0.0, flat_root), (3.0, flat_root)],
        "spine":      [(0.0, (10, 0, 0)), (1.5, (11, 0, 0)), (3.0, (10, 0, 0))],
        "chest":      [(0.0, (12, 0, 0)), (1.5, (14, 0, 0)), (3.0, (12, 0, 0))],
        "head":       [(0.0, (16, -10, 0)), (1.5, (16, -12, 0)), (3.0, (16, -10, 0))],
        "upperarm_L": [(0.0, (-8, 0, 66)), (3.0, (-8, 0, 66))],
        "upperarm_R": [(0.0, (-8, 0, -66)), (3.0, (-8, 0, -66))],
        "forearm_L":  [(0.0, (-14, 0, 12)), (3.0, (-14, 0, 12))],
        "forearm_R":  [(0.0, (-14, 0, -12)), (1.1, (-14, 0, -12)), (1.35, (-24, 0, -12)),
                       (1.6, (-14, 0, -12)), (3.0, (-14, 0, -12))],
        "hand_R":     [(0.0, (0, 0, 0)), (1.1, (0, 0, 0)), (1.35, (0, 0, -22)),
                       (1.6, (0, 0, 0)), (3.0, (0, 0, 0))],
        "thigh_L":    [(0.0, (-14, 0, 14)), (3.0, (-14, 0, 14))],
        "thigh_R":    [(0.0, (-14, 0, -14)), (3.0, (-14, 0, -14))],
        "shin_L":     [(0.0, (20, 0, 0)), (3.0, (20, 0, 0))],
        "shin_R":     [(0.0, (20, 0, 0)), (3.0, (20, 0, 0))],
    }, pos={"root": [(0.0, flat_pos), (3.0, flat_pos)]}))

    return out


# --------------------------------------------------------------------------
# glTF assembly
# --------------------------------------------------------------------------

class Buffer:
    def __init__(self):
        self.blob = bytearray()
        self.views = []

    def view(self, data, target=None, name=None):
        while len(self.blob) % 4:
            self.blob.append(0)
        offset = len(self.blob)
        self.blob += data
        v = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target is not None:
            v["target"] = target
        if name:
            v["name"] = name
        self.views.append(v)
        return len(self.views) - 1


def build():
    mesh = build_body()
    buf = Buffer()
    accessors = []

    def acc(view, ctype, count, atype, mn=None, mx=None):
        a = {"bufferView": view, "componentType": ctype, "count": count, "type": atype}
        if mn is not None:
            a["min"] = list(mn)
            a["max"] = list(mx)
        accessors.append(a)
        return len(accessors) - 1

    # --- vertex attributes ---
    n = len(mesh.pos)
    lo = [min(p[i] for p in mesh.pos) for i in range(3)]
    hi = [max(p[i] for p in mesh.pos) for i in range(3)]

    a_pos = acc(buf.view(struct.pack("<%df" % (n * 3), *[c for p in mesh.pos for c in p]),
                         34962, "POSITION"), 5126, n, "VEC3", lo, hi)
    a_nrm = acc(buf.view(struct.pack("<%df" % (n * 3), *[c for p in mesh.nrm for c in p]),
                         34962, "NORMAL"), 5126, n, "VEC3")
    a_uv = acc(buf.view(struct.pack("<%df" % (n * 2), *[c for p in mesh.uv for c in p]),
                        34962, "TEXCOORD_0"), 5126, n, "VEC2")
    a_jnt = acc(buf.view(bytes(c for p in mesh.jnt for c in p), 34962, "JOINTS_0"),
                5121, n, "VEC4")
    a_wgt = acc(buf.view(struct.pack("<%df" % (n * 4), *[c for p in mesh.wgt for c in p]),
                         34962, "WEIGHTS_0"), 5126, n, "VEC4")
    a_idx = acc(buf.view(struct.pack("<%dI" % len(mesh.idx), *mesh.idx), 34963, "indices"),
                5125, len(mesh.idx), "SCALAR")

    # --- skin ---
    ibm = bytearray()
    for _, _, p in JOINTS:
        ibm += struct.pack("<16f",
                           1, 0, 0, 0,
                           0, 1, 0, 0,
                           0, 0, 1, 0,
                           -p[0], -p[1], -p[2], 1)
    a_ibm = acc(buf.view(bytes(ibm), None, "inverseBindMatrices"), 5126, len(JOINTS), "MAT4")

    # --- nodes: one per joint, plus the skinned mesh ---
    nodes = []
    for name, parent, pos in JOINTS:
        local = pos if parent is None else tuple(
            pos[i] - JOINT_POS[parent][i] for i in range(3))
        nodes.append({"name": name, "translation": list(local)})
    for i, (name, parent, _) in enumerate(JOINTS):
        if parent is not None:
            nodes[JOINT_INDEX[parent]].setdefault("children", []).append(i)

    mesh_node = len(nodes)
    nodes.append({"name": "BadOfficeManager", "mesh": 0, "skin": 0})

    # --- animations ---
    animations = []
    for clip in clips():
        samplers = []
        channels = []

        def curve(times, values, stride):
            t = buf.view(struct.pack("<%df" % len(times), *times), None)
            a_t = acc(t, 5126, len(times), "SCALAR", [min(times)], [max(times)])
            v = buf.view(struct.pack("<%df" % len(values), *values), None)
            a_v = acc(v, 5126, len(values) // stride, "VEC4" if stride == 4 else "VEC3")
            samplers.append({"input": a_t, "output": a_v, "interpolation": "LINEAR"})
            return len(samplers) - 1

        for joint, keys in sorted(clip.get("rot", {}).items()):
            times = [k[0] for k in keys]
            quats = []
            prev = None
            for _, e in keys:
                q = euler_quat(*e)
                # Keep the quaternion on the same hemisphere as its predecessor,
                # so LINEAR interpolation never takes the long way round.
                if prev and sum(q[i] * prev[i] for i in range(4)) < 0:
                    q = tuple(-c for c in q)
                prev = q
                quats += list(q)
            s = curve(times, quats, 4)
            channels.append({"sampler": s,
                             "target": {"node": JOINT_INDEX[joint], "path": "rotation"}})

        for joint, keys in sorted(clip.get("pos", {}).items()):
            times = [k[0] for k in keys]
            base = JOINT_POS[joint] if JOINTS[JOINT_INDEX[joint]][1] is None else (0, 0, 0)
            vals = []
            for _, d in keys:
                vals += [base[i] + d[i] for i in range(3)]
            s = curve(times, vals, 3)
            channels.append({"sampler": s,
                             "target": {"node": JOINT_INDEX[joint], "path": "translation"}})

        animations.append({"name": clip["name"], "samplers": samplers, "channels": channels})

    # --- texture ---
    atlas, aw, ah = build_atlas()
    png = encode_png(aw, ah, atlas)
    img_view = buf.view(png, None, "atlas")

    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "call-center-game gen_manager_glb.py",
        },
        "scene": 0,
        "scenes": [{"name": "Scene", "nodes": [0, mesh_node]}],
        "nodes": nodes,
        "meshes": [{
            "name": "BadOfficeManager",
            "primitives": [{
                "attributes": {
                    "POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv,
                    "JOINTS_0": a_jnt, "WEIGHTS_0": a_wgt,
                },
                "indices": a_idx,
                "material": 0,
            }],
        }],
        "skins": [{
            "name": "ManagerRig",
            "inverseBindMatrices": a_ibm,
            "skeleton": 0,
            "joints": list(range(len(JOINTS))),
        }],
        "materials": [{
            "name": "manager_palette",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.85,
            },
        }],
        "textures": [{"source": 0, "sampler": 0}],
        # Nearest filtering: the atlas is flat colour blocks, and any smoothing
        # across a cell boundary shows up as a bleed line on an edge.
        "samplers": [{"magFilter": 9728, "minFilter": 9987,
                      "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": img_view, "mimeType": "image/png", "name": "atlas"}],
        "animations": animations,
        "accessors": accessors,
        "bufferViews": buf.views,
        "buffers": [{"byteLength": len(buf.blob)}],
    }

    return gltf, bytes(buf.blob), mesh, lo, hi


def write_glb(gltf, blob, path):
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    bin_ = blob + b"\x00" * ((4 - len(blob) % 4) % 4)
    body = (struct.pack("<I", len(js)) + b"JSON" + js
            + struct.pack("<I", len(bin_)) + b"BIN\x00" + bin_)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


def main():
    gltf, blob, mesh, lo, hi = build()
    write_glb(gltf, blob, OUT)

    height = hi[1] - lo[1]
    width = max(hi[0] - lo[0], hi[2] - lo[2])
    tris = len(mesh.idx) // 3

    print("wrote %s (%.1f KB)" % (os.path.relpath(OUT, HERE), os.path.getsize(OUT) / 1024.0))
    print("  vertices   %d" % len(mesh.pos))
    print("  triangles  %d" % tris)
    print("  joints     %d" % len(JOINTS))
    print("  animations %d  (%s)" % (len(gltf["animations"]),
                                     ", ".join(a["name"] for a in gltf["animations"])))
    print("  height     %.3f m  (spec %.2f)" % (height, TARGET_HEIGHT))
    print("  max width  %.3f m  (capsule diameter %.2f)" % (width, CAPSULE_RADIUS * 2))

    # The art has to sit on the floor and inside the collision capsule, or it
    # clips through the doorways the level format guarantees are passable.
    assert abs(lo[1]) < 1e-6, "feet must sit on y=0, got %.4f" % lo[1]
    assert abs(height - TARGET_HEIGHT) < 0.01, "height %.3f off spec" % height
    assert width <= CAPSULE_RADIUS * 2, "art %.3f wider than capsule" % width
    print("  OK: sits on the floor, on-spec height, fits the capsule")


if __name__ == "__main__":
    main()
