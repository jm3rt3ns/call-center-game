"""Model the manager in his rest (A-) pose.

Each wardrobe layer is its own shell: skin, shirt, slacks, shoes, hair, tie,
suspenders, collar, glasses, watch, belt, mug. Organic parts are built from
overlapping primitives and voxel remeshed into one smooth surface; the flat
things (tie, straps, pocket) are strips shrink-wrapped onto the shirt.
"""

import math

import bpy
from mathutils import Vector

from . import geom as G
from .measure import HEAD_PIVOT, HEAD_SCALE, J, X_ANKLE, X_ELBOW, X_SHOULDER, X_WRIST, Z_ANKLE, Z_BELT, Z_CHEST, Z_CHIN, Z_HEAD, Z_HIP, Z_KNEE, Z_NECK, Z_SHOULDER, Z_TOP, Z_WAIST

D = math.radians


def mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    return m


def _tag(obj, material, bone=None):
    G.set_material(obj, mat(material))
    if bone:
        obj["bone"] = bone  # rigid props: which joint carries them
    return obj


# --------------------------------------------------------------------------
# skin: head, neck, arms, fists
# --------------------------------------------------------------------------

def head_parts():
    zc = Z_HEAD
    parts = [
        # cranium: wide and a little flat at the sides
        G.ellipsoid("cranium", (0, 0.0, zc + 0.015), (0.100, 0.108, 0.104)),
        G.ellipsoid("cranium_back", (0, 0.028, zc), (0.096, 0.104, 0.098)),
        G.rbox("skull_sides", (0, 0.0, zc + 0.02), (0.196, 0.17, 0.13), bevel=0.05, segments=6),
        # square jaw and chin
        G.rbox("jaw", (0, -0.005, zc - 0.075), (0.182, 0.175, 0.11), bevel=0.038, segments=6),
        G.rbox("jaw_low", (0, -0.02, zc - 0.11), (0.15, 0.15, 0.06), bevel=0.025, segments=5),
        G.rbox("chin", (0, -0.06, zc - 0.126), (0.09, 0.06, 0.05), bevel=0.018, segments=4),
        # flat cheek planes
        G.rbox("cheek_L", (0.064, -0.045, zc - 0.035), (0.065, 0.09, 0.05), bevel=0.024, segments=5),
        G.rbox("cheek_R", (-0.064, -0.045, zc - 0.035), (0.065, 0.09, 0.05), bevel=0.024, segments=5),
        # heavy brow ridge
        G.capsule("brow", (-0.075, -0.086, zc + 0.024), (0.075, -0.086, zc + 0.024), 0.026),
        # forehead
        G.ellipsoid("forehead", (0, -0.04, zc + 0.05), (0.09, 0.062, 0.058)),
        # nose
        G.capsule("nose_bridge", (0, -0.094, zc + 0.02), (0, -0.124, zc - 0.045), 0.013, 0.021),
        G.sphere("nose_tip", (0, -0.126, zc - 0.05), 0.022),
        G.sphere("nostril_L", (0.019, -0.11, zc - 0.056), 0.014),
        G.sphere("nostril_R", (-0.019, -0.11, zc - 0.056), 0.014),
        # ears
        G.ellipsoid("ear_L", (0.109, 0.008, zc - 0.02), (0.016, 0.028, 0.038)),
        G.ellipsoid("ear_R", (-0.109, 0.008, zc - 0.02), (0.016, 0.028, 0.038)),
        # mouth block
        G.ellipsoid("mouth", (0, -0.088, zc - 0.104), (0.042, 0.03, 0.022)),
        # thick short neck flaring into the traps
        G.capsule("neck", (0, 0.015, zc - 0.10), (0, 0.02, Z_NECK - 0.06), 0.072, 0.09),
    ]
    return parts


def arm_parts(side):
    s = 1 if side == "L" else -1
    sh, el, wr, fi = (Vector(J[k + "_" + side]) for k in ("shoulder", "elbow", "wrist", "fist"))
    parts = [
        G.sphere("deltoid", sh + Vector((s * 0.005, 0, -0.01)), 0.10),
        G.capsule("upper_arm", sh + Vector((s * 0.01, 0, -0.03)), el, 0.085, 0.07),
        G.ellipsoid("biceps", sh * 0.45 + el * 0.55 + Vector((0, -0.02, 0)), (0.075, 0.07, 0.10),
                    rot=(0, s * D(-14), 0)),
        G.sphere("elbow", el, 0.062),
        G.capsule("forearm", el, wr, 0.078, 0.056),
        G.ellipsoid("forearm_bulge", el * 0.7 + wr * 0.3 + Vector((s * 0.01, -0.01, 0)), (0.07, 0.065, 0.09),
                    rot=(0, s * D(-10), 0)),
        G.sphere("wrist", wr, 0.053),
    ]
    parts += fist_parts(side, fi)
    return parts


def fist_parts(side, fi):
    s = 1 if side == "L" else -1
    fi = Vector(fi)
    parts = [
        G.rbox("palm", fi, (0.095, 0.085, 0.11), bevel=0.03, segments=5),
    ]
    # curled fingers: a vertical row of knuckles across the front of the fist
    for i in range(4):
        z = fi.z + 0.036 - i * 0.024
        if side == "L" and i == 0:
            # the pointing finger is modelled straight; index1_L/index2_L fold it
            parts.append(G.capsule("index", (fi.x, fi.y - 0.04, z), (fi.x, fi.y - 0.123, z), 0.0155, 0.0135))
            continue
        parts.append(G.capsule("finger%d" % i, (fi.x - 0.034 * s, fi.y - 0.05, z),
                               (fi.x + 0.034 * s, fi.y - 0.05, z), 0.016))
    # thumb folded across the front
    parts.append(G.capsule("thumb", (fi.x - 0.025 * s, fi.y - 0.055, fi.z + 0.048),
                           (fi.x + 0.035 * s, fi.y - 0.066, fi.z + 0.022), 0.017))
    return parts


def build_skin():
    head = [G.scale_about(o, HEAD_PIVOT, HEAD_SCALE) for o in head_parts()]
    parts = head + arm_parts("L") + arm_parts("R")
    skin = G.join(parts, "Skin")
    G.remesh(skin, 0.0065, smooth_iter=8, smooth_factor=0.5, target_faces=None)
    return _tag(skin, "skin")


def decimate_skin(skin, target_faces=10000):
    G.decimate(skin, target_faces)
    G.shade_smooth(skin)


# --------------------------------------------------------------------------
# shirt: torso, traps, short sleeves
# --------------------------------------------------------------------------

def build_shirt():
    zc = Z_CHEST
    parts = [
        # rib cage / core
        G.ellipsoid("core", (0, 0.0, zc - 0.02), (0.255, 0.155, 0.21)),
        # pecs
        G.ellipsoid("pec_L", (0.115, -0.075, zc + 0.03), (0.15, 0.095, 0.11), rot=(D(10), 0, D(-8))),
        G.ellipsoid("pec_R", (-0.115, -0.075, zc + 0.03), (0.15, 0.095, 0.11), rot=(D(10), 0, D(8))),
        # lats / upper back
        G.ellipsoid("back", (0, 0.045, zc + 0.02), (0.265, 0.13, 0.19)),
        G.ellipsoid("upper_back", (0, 0.035, zc + 0.14), (0.24, 0.12, 0.09)),
        # belly, tapering to the belt
        G.ellipsoid("belly", (0, -0.01, Z_WAIST + 0.01), (0.205, 0.15, 0.13)),
        G.capsule("waist", (0, 0, Z_WAIST), (0, 0, Z_BELT + 0.012), 0.195, 0.188, cap0=False, cap1=False),
        G.ellipsoid("waist_e", (0, 0, Z_BELT + 0.012), (0.188, 0.14, 0.02)),
        # traps rising from the shoulders to the neck
        G.capsule("trap_L", (0.05, 0.02, Z_NECK + 0.005), (0.215, 0.0, Z_SHOULDER - 0.005), 0.055, 0.08),
        G.capsule("trap_R", (-0.05, 0.02, Z_NECK + 0.005), (-0.215, 0.0, Z_SHOULDER - 0.005), 0.055, 0.08),
        # shirt neck opening base (under the collar)
        G.capsule("shirt_neck", (0, 0.015, Z_NECK - 0.04), (0, 0.015, Z_NECK + 0.012), 0.096, 0.09),
    ]
    for s, side in ((1, "L"), (-1, "R")):
        sh = Vector(J["shoulder_" + side])
        el = Vector(J["elbow_" + side])
        hem = sh * 0.45 + el * 0.55  # sleeve ends at mid biceps
        parts += [
            G.sphere("shoulder_cap", sh + Vector((s * 0.01, 0, -0.005)), 0.118),
            G.capsule("sleeve", sh + Vector((s * 0.012, 0, -0.02)), hem, 0.115, 0.098, cap0=True, cap1=False),
            G.capsule("sleeve_hem", hem + (sh - hem).normalized() * 0.02, hem, 0.102, 0.104, cap0=False, cap1=False),
        ]
    shirt = G.join(parts, "Shirt")
    G.remesh(shirt, 0.008, smooth_iter=8, smooth_factor=0.5, target_faces=7000)
    return _tag(shirt, "shirt")


# --------------------------------------------------------------------------
# slacks, belt, shoes
# --------------------------------------------------------------------------

def build_slacks():
    parts = [
        G.ellipsoid("pelvis", (0, 0.0, Z_HIP + 0.03), (0.215, 0.15, 0.13)),
        G.capsule("hips_band", (0, 0, Z_HIP + 0.05), (0, 0, Z_BELT + 0.0), 0.205, 0.192, cap0=False, cap1=False),
        G.ellipsoid("hips_top", (0, 0, Z_BELT + 0.0), (0.192, 0.142, 0.02)),
        G.ellipsoid("seat_L", (0.095, 0.065, Z_HIP - 0.01), (0.12, 0.10, 0.11)),
        G.ellipsoid("seat_R", (-0.095, 0.065, Z_HIP - 0.01), (0.12, 0.10, 0.11)),
        G.ellipsoid("crotch", (0, 0.0, Z_HIP - 0.07), (0.16, 0.12, 0.08)),
    ]
    for side in ("L", "R"):
        hip, knee, ankle = (Vector(J[k + "_" + side]) for k in ("hip", "knee", "ankle"))
        parts += [
            G.capsule("thigh", hip + Vector((0, 0.01, 0.02)), knee, 0.108, 0.088),
            G.sphere("knee", knee, 0.088),
            G.capsule("shin", knee, ankle + Vector((0, 0.0, 0.01)), 0.088, 0.078, cap0=True, cap1=False),
            G.capsule("cuff", ankle + Vector((0, 0, 0.06)), ankle + Vector((0, 0, 0.01)), 0.08, 0.082,
                      cap0=False, cap1=False),
        ]
    slacks = G.join(parts, "Slacks")
    G.remesh(slacks, 0.008, smooth_iter=8, smooth_factor=0.5, target_faces=5000)
    return _tag(slacks, "slacks")


def build_belt():
    band = G.torus("Belt", (0, 0.0, Z_BELT - 0.01), 0.196, 0.011, scale=(1.05, 0.8, 1.9))
    G.shade_smooth(band)
    _tag(band, "leather")
    buckle = G.rbox("Buckle", (0, -0.158, Z_BELT - 0.01), (0.058, 0.014, 0.046), bevel=0.004, segments=2)
    inner = G.rbox("Buckle_in", (0, -0.165, Z_BELT - 0.01), (0.036, 0.012, 0.026), bevel=0.003, segments=2)
    buckle = G.join([buckle, inner], "Buckle")
    G.shade_smooth(buckle, 50)
    _tag(buckle, "brass")
    return [band, buckle]


def build_shoes():
    shoes = []
    for side in ("L", "R"):
        ankle = Vector(J["ankle_" + side])
        x = ankle.x
        parts = [
            G.ellipsoid("toe", (x, -0.12, 0.038), (0.052, 0.10, 0.038)),
            G.ellipsoid("vamp", (x, -0.04, 0.045), (0.056, 0.10, 0.045)),
            G.rbox("heel", (x, 0.045, 0.04), (0.10, 0.10, 0.075), bevel=0.03, segments=5),
            G.rbox("sole", (x, -0.03, 0.012), (0.105, 0.28, 0.02), bevel=0.01, segments=3),
            G.capsule("ankle_cuff", (x, 0.01, 0.06), (x, 0.01, Z_ANKLE + 0.02), 0.06, 0.055, cap0=False),
        ]
        shoe = G.join(parts, "Shoe_" + side)
        G.remesh(shoe, 0.005, smooth_iter=6, smooth_factor=0.5, target_faces=700)
        shoes.append(_tag(shoe, "shoe"))
    return shoes


# --------------------------------------------------------------------------
# hair, eyes, brows, glasses
# --------------------------------------------------------------------------

def build_hair(skin):
    """Crew cut: a thin shell copied off the skull, cut at the hairline."""
    import bmesh

    zc = Z_HEAD
    P, S = HEAD_PIVOT[2], HEAD_SCALE

    def hz(z):  # a head-space height after the head scale
        return P + (z - P) * S

    me = skin.data.copy()
    hair = bpy.data.objects.new("Hair", me)
    bpy.context.scene.collection.objects.link(hair)
    # keep the skull only
    G.bisect_keep(hair, (0, 0, hz(zc + 0.005)), (0, 0, 1))
    # hairline: forehead plane sloping back, then level above the ears
    G.bisect_keep(hair, (0, -0.095 * S, hz(zc + 0.062)), (0, 0.8, 1.0))
    G.bisect_keep(hair, (0, 0, hz(zc + 0.018)), (0, 0, 1))
    # push the shell out and give it thickness
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.009
    bm.to_mesh(me)
    bm.free()
    G.solidify(hair, 0.012, offset=-1.0, even=False)
    # flat top
    G.bisect_keep(hair, (0, 0, Z_TOP - 0.002), (0, 0, -1.0), fill=True)
    sm = hair.modifiers.new("smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 3
    G.apply_modifiers(hair)
    G.decimate(hair, 1500)
    G.shade_smooth(hair, 40)
    return _tag(hair, "hair", bone="head")


def build_face_bits():
    zc = Z_HEAD
    out = []

    def pair(name, y, radii, mat_name):
        objs = [G.ellipsoid(name, (s * 0.036, y, zc - 0.006), radii, seg=20, rings=10) for s in (1, -1)]
        o = G.join(objs, name)
        G.shade_smooth(o)
        return _tag(o, mat_name, bone="head")

    out.append(pair("Eyes", -0.087, (0.0145, 0.013, 0.0125), "eye"))
    out.append(pair("Iris", -0.0992, (0.0078, 0.003, 0.0078), "iris"))
    out.append(pair("Pupil", -0.1014, (0.0042, 0.002, 0.0042), "pupil"))
    brows = []
    for s in (1, -1):
        brows.append(G.rbox("brow", (s * 0.038, -0.108, zc + 0.033), (0.052, 0.012, 0.014),
                            rot=(D(-12), s * D(-15), s * D(5)), bevel=0.004, segments=2))
    brows = G.join(brows, "Brows")
    G.shade_smooth(brows, 45)
    out.append(_tag(brows, "brow", bone="head"))
    return out


def build_glasses():
    zc = Z_HEAD
    rims = []
    lenses = []
    for s in (1, -1):
        cx, cy, cz = s * 0.038, -0.112, zc - 0.008
        w, h, r = 0.052, 0.036, 0.010
        # rounded-rectangle rim as a ring of capsules
        pts = []
        n = 6
        for corner, (ox, oz) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
            a0 = math.radians(90 * corner)
            for i in range(n + 1):
                a = a0 + math.radians(90) * i / n
                pts.append((cx + ox * (w / 2 - r) + r * math.cos(a), cy, cz + oz * (h / 2 - r) + r * math.sin(a)))
        for i in range(len(pts)):
            rims.append(G.capsule("rim", pts[i], pts[(i + 1) % len(pts)], 0.0028, seg=8))
        lens = G.rbox("lens", (cx, cy + 0.002, cz), (w - 0.004, 0.002, h - 0.004), bevel=0.008, segments=3)
        lenses.append(lens)
    # bridge and temples
    rims.append(G.capsule("bridge", (-0.012, -0.110, zc + 0.0), (0.012, -0.110, zc + 0.0), 0.0028, seg=8))
    for s in (1, -1):
        rims.append(G.capsule("temple", (s * 0.065, -0.108, zc + 0.002), (s * 0.104, -0.005, zc + 0.006), 0.0028, seg=8))
        rims.append(G.capsule("temple_tip", (s * 0.104, -0.005, zc + 0.006), (s * 0.104, 0.025, zc - 0.015), 0.0026, seg=8))
    frame = G.join(rims, "Glasses")
    G.remesh(frame, 0.0016, smooth_iter=2, smooth_factor=0.4, target_faces=None)
    G.decimate(frame, 1800, quads=False)
    lens = G.join(lenses, "Lenses")
    G.shade_smooth(lens, 60)
    return [_tag(frame, "frame", bone="head"), _tag(lens, "lens", bone="head")]


# --------------------------------------------------------------------------
# collar, tie, pocket, suspenders (need the shirt surface)
# --------------------------------------------------------------------------

def build_collar(shirt):
    zc = Z_NECK
    band = G.torus("collar_band", (0, 0.015, zc + 0.008), 0.088, 0.013, scale=(1.0, 0.95, 1.9))
    G.shade_smooth(band)
    flaps = []
    for s in (1, -1):
        # collar point: a wedge from the neck out over the chest, tip pointing down
        verts = [
            (s * 0.018, -0.30, zc + 0.012),   # at the knot, top
            (s * 0.082, -0.30, zc + 0.005),   # outer top
            (s * 0.085, -0.30, zc - 0.03),    # outer
            (s * 0.045, -0.30, zc - 0.072),   # the point
            (s * 0.022, -0.30, zc - 0.03),    # inner, under the knot
        ]
        flap = G.new_mesh_obj("collar_flap", verts, [(0, 1, 2, 3, 4)])
        G.shrinkwrap(flap, shirt, 0.014, project_axis="y")
        G.solidify(flap, 0.009, offset=1.0)
        flaps.append(flap)
    collar = G.join([band] + flaps, "Collar")
    G.shade_smooth(collar, 45)
    return _tag(collar, "collar", bone="neck")


def build_tie(shirt):
    zc = Z_NECK
    knot = G.ellipsoid("Knot", (0, -0.115, zc - 0.032), (0.027, 0.02, 0.03))
    G.shade_smooth(knot)
    _tag(knot, "tie", bone="neck")
    # blade profile (x, z), extruded in y and wrapped onto the shirt
    prof = [(-0.021, zc - 0.05), (0.021, zc - 0.05), (0.045, 1.27), (0.047, 1.13), (0.0, Z_BELT - 0.005),
            (-0.047, 1.13), (-0.045, 1.27)]
    pts = G.catmull_rom(prof, samples_per_seg=1)
    # build as a strip of quads down the centre line, so it bends with the belly
    zs = [zc - 0.05] + [zc - 0.05 - 0.02 * i for i in range(1, 30)]
    verts, faces = [], []
    def half_width(z):
        if z > 1.27:
            t = (zc - 0.05 - z) / (zc - 0.05 - 1.27)
            return 0.021 + (0.045 - 0.021) * t
        if z > 1.13:
            return 0.045 + 0.002 * (1.27 - z) / 0.14
        t = (1.13 - z) / (1.13 - (Z_BELT + 0.03))
        return max(0.047 * (1 - t), 0.0)
    zs = [z for z in zs if z >= Z_BELT + 0.03] + [Z_BELT + 0.03]
    for i, z in enumerate(zs):
        hw = half_width(z)
        verts += [(-hw, -0.25, z), (0, -0.25, z), (hw, -0.25, z)]
        if i:
            k = 3 * i
            faces += [(k - 3, k - 2, k + 1, k), (k - 2, k - 1, k + 2, k + 1)]
    tie = G.new_mesh_obj("Tie", verts, faces)
    G.shrinkwrap(tie, shirt, 0.012, project_axis="y")
    G.solidify(tie, 0.012, offset=1.0)
    G.shade_smooth(tie, 60)
    return [knot, _tag(tie, "tie")]


def build_pocket(shirt):
    # breast pocket on his right, with a pen
    x = -0.135
    pocket = G.rbox("Pocket", (x, -0.25, Z_CHEST + 0.02), (0.075, 0.003, 0.085), bevel=0.006, segments=2)
    G.shrinkwrap(pocket, shirt, 0.005, project_axis="y")
    G.shade_smooth(pocket, 45)
    _tag(pocket, "shirt")
    pen = G.capsule("Pen", (x - 0.012, -0.185, Z_CHEST + 0.045), (x - 0.012, -0.19, Z_CHEST + 0.085), 0.0045, seg=10)
    G.shade_smooth(pen)
    _tag(pen, "pen", bone="chest")
    return [pocket, pen]


def build_suspenders(shirt):
    bvh = G.bvh_of(shirt)
    straps = []
    for s in (1, -1):
        # front: belt -> chest -> over the shoulder -> cross the back -> belt
        ctrl = [
            (s * 0.09, -0.19, Z_BELT + 0.01),
            (s * 0.10, -0.20, 1.20),
            (s * 0.12, -0.20, Z_CHEST + 0.05),
            (s * 0.145, -0.16, Z_SHOULDER - 0.02),
            (s * 0.155, -0.02, Z_SHOULDER + 0.06),
            (s * 0.14, 0.12, Z_SHOULDER - 0.05),
            (s * 0.07, 0.19, 1.36),
            (0.0, 0.20, 1.27),
            (-s * 0.07, 0.19, 1.17),
            (-s * 0.10, 0.17, Z_BELT + 0.01),
        ]
        path = G.catmull_rom(ctrl, samples_per_seg=24)
        strap = G.ribbon("strap", path, 0.042, target_bvh=bvh, lift=0.006)
        G.solidify(strap, 0.006, offset=1.0)
        straps.append(strap)
    strap = G.join(straps, "Suspenders")
    G.shade_smooth(strap, 75)
    out = [_tag(strap, "maroon")]
    # brass sliders on the chest, clips at the belt, leather patch at the back cross
    bits = []
    for s in (1, -1):
        loc, nrm, _, _ = bvh.find_nearest(Vector((s * 0.118, -0.25, Z_CHEST + 0.06)))
        bits.append(G.rbox("slider", loc + nrm * 0.010, (0.046, 0.007, 0.03), rot=(0, s * D(-8), 0), bevel=0.003, segments=2))
        loc, nrm, _, _ = bvh.find_nearest(Vector((s * 0.085, -0.25, Z_BELT + 0.012)))
        bits.append(G.rbox("clip", loc + nrm * 0.011, (0.032, 0.008, 0.026), bevel=0.003, segments=2))
        loc, nrm, _, _ = bvh.find_nearest(Vector((-s * 0.10, 0.25, Z_BELT + 0.012)))
        bits.append(G.rbox("clip_b", loc + nrm * 0.011, (0.032, 0.008, 0.026), bevel=0.003, segments=2))
    brass = G.join(bits, "Suspender_brass")
    G.shade_smooth(brass, 45)
    out.append(_tag(brass, "brass"))
    loc, nrm, _, _ = bvh.find_nearest(Vector((0, 0.3, 1.27)))
    patch = G.rbox("Back_patch", loc + nrm * 0.013, (0.055, 0.006, 0.055), rot=(0, 0, D(45)), bevel=0.004, segments=2)
    G.shade_smooth(patch, 45)
    out.append(_tag(patch, "leather"))
    return out


# --------------------------------------------------------------------------
# watch (left wrist) and the mug (right hand)
# --------------------------------------------------------------------------

def build_watch():
    wr = Vector(J["wrist_L"]) + Vector((0.0, 0.0, 0.02))
    band = G.torus("Watch_band", wr, 0.056, 0.0055, scale=(1.0, 1.0, 1.8))
    G.shade_smooth(band)
    _tag(band, "leather", bone="hand_L")
    case = G.join([
        G.capsule("case", wr + Vector((0.052, 0, 0)), wr + Vector((0.066, 0, 0)), 0.024, 0.024, cap0=False, cap1=False),
        G.ellipsoid("case_top", wr + Vector((0.066, 0, 0)), (0.004, 0.024, 0.024)),
        G.ellipsoid("case_bot", wr + Vector((0.052, 0, 0)), (0.004, 0.024, 0.024)),
    ], "Watch_case")
    G.shade_smooth(case, 45)
    _tag(case, "brass", bone="hand_L")
    dial = G.ellipsoid("Watch_dial", wr + Vector((0.0685, 0, 0)), (0.002, 0.018, 0.018))
    G.shade_smooth(dial)
    _tag(dial, "dial", bone="hand_L")
    return [band, case, dial]


def build_mug():
    """The NOT MY JOB mug. Built with explicit UVs: u wraps around the body, v
    runs bottom to top, so the label texture can be printed straight on."""
    import bmesh

    r, h, seg = 0.041, 0.098, 40
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    rings = []
    for zi, z in enumerate((0.0, h)):
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
        rings.append(ring)
    faces = []
    for i in range(seg):
        a, b = rings[0][i], rings[0][(i + 1) % seg]
        c, d = rings[1][(i + 1) % seg], rings[1][i]
        f = bm.faces.new((a, b, c, d))
        us = [(i) / seg, (i + 1) / seg, (i + 1) / seg, i / seg]
        vs = [0.05, 0.05, 0.95, 0.95]
        for loop, u_, v_ in zip(f.loops, us, vs):
            loop[uv].uv = (u_, v_)
        faces.append(f)
    # bottom and a recessed top (rim ring + inner disc a little below the lip)
    bot = bm.faces.new(list(reversed(rings[0])))
    inner = [bm.verts.new((0.85 * r * math.cos(2 * math.pi * i / seg), 0.85 * r * math.sin(2 * math.pi * i / seg), h)) for i in range(seg)]
    inner_low = [bm.verts.new((0.85 * r * math.cos(2 * math.pi * i / seg), 0.85 * r * math.sin(2 * math.pi * i / seg), h - 0.02)) for i in range(seg)]
    for i in range(seg):
        bm.faces.new((rings[1][i], rings[1][(i + 1) % seg], inner[(i + 1) % seg], inner[i]))
        bm.faces.new((inner[i], inner[(i + 1) % seg], inner_low[(i + 1) % seg], inner_low[i]))
    coffee = bm.faces.new(inner_low)
    for f in bm.faces:
        if f not in faces:
            for loop in f.loops:
                loop[uv].uv = (0.02, 0.02) if f is not coffee else (0.98, 0.98)
    me = bpy.data.meshes.new("Mug")
    bm.to_mesh(me)
    bm.free()
    body = bpy.data.objects.new("Mug", me)
    bpy.context.scene.collection.objects.link(body)
    # handle: half torus on the +Y side
    handle = G.torus("Mug_handle", (0, r + 0.012, h * 0.5), 0.026, 0.0065, rot=(0, D(90), 0), scale=(1.15, 1, 1))
    G.bisect_keep(handle, (0, r + 0.004, 0), (0, 1, 0))
    G.solidify(handle, 0.0001)  # no-op thickness keeps the cut edge closed
    handle.data.uv_layers.new(name="UVMap")
    for l in handle.data.uv_layers[0].data:
        l.uv = (0.02, 0.02)
    mug = G.join([body, handle], "Mug")
    G.shade_smooth(mug, 50)
    # The mug's own texture carries the label, so it keeps its own material.
    _tag(mug, "mug", bone="hand_R")
    # rest placement: lying in the right fist; the rig re-parents it (rig.py)
    fi = Vector(J["fist_R"])
    mug.location = fi + Vector((0.0, -0.075, -0.045))
    return mug


def build_all():
    """Build every part; returns dict name -> object."""
    out = {}
    skin = build_skin()
    shirt = build_shirt()
    slacks = build_slacks()
    out["Skin"] = skin
    out["Shirt"] = shirt
    out["Slacks"] = slacks
    hair = build_hair(skin)   # copied off the smooth skull before it is decimated
    decimate_skin(skin)
    for o in build_belt() + build_shoes() + [hair] + build_face_bits() + build_glasses():
        out[o.name] = o
    for name in ("Eyes", "Iris", "Pupil", "Brows", "Glasses", "Lenses"):
        G.scale_about(out[name], HEAD_PIVOT, HEAD_SCALE)
    out["Collar"] = build_collar(shirt)
    for o in build_tie(shirt) + build_pocket(shirt) + build_suspenders(shirt) + build_watch():
        out[o.name] = o
    out["Mug"] = build_mug()
    return out
