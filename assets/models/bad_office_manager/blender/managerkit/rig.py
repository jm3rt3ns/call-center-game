"""Armature, skinning and prop attachment."""

import math

import bpy
from mathutils import Matrix, Vector

from .measure import J

# name: (head, tail, parent, deform radius used by the proximity fallback)
BONES = [
    ("root", J["root"], (0, 0, 0.12), None, 0.0),
    ("hips", J["hips"], J["spine"], "root", 0.17),
    ("spine", J["spine"], J["chest"], "hips", 0.16),
    ("chest", J["chest"], J["neck"], "spine", 0.24),
    ("neck", J["neck"], J["head"], "chest", 0.09),
    ("head", J["head"], J["head_top"], "neck", 0.16),
]
for s, side in ((1, "L"), (-1, "R")):
    sh, el, wr, fi = (Vector(J[k + "_" + side]) for k in ("shoulder", "elbow", "wrist", "fist"))
    hip, knee, ankle, toe = (Vector(J[k + "_" + side]) for k in ("hip", "knee", "ankle", "toe"))
    BONES += [
        ("clav_" + side, (s * 0.03, 0.0, sh.z), tuple(sh), "chest", 0.09),
        ("upper_arm_" + side, tuple(sh), tuple(el), "clav_" + side, 0.11),
        ("forearm_" + side, tuple(el), tuple(wr), "upper_arm_" + side, 0.085),
        ("hand_" + side, tuple(wr), (fi.x, fi.y, fi.z - 0.055), "forearm_" + side, 0.075),
        ("thigh_" + side, tuple(hip), tuple(knee), "hips", 0.13),
        ("shin_" + side, tuple(knee), tuple(ankle), "thigh_" + side, 0.10),
        ("foot_" + side, tuple(ankle), tuple(toe), "shin_" + side, 0.075),
        ("toe_" + side, tuple(toe), (toe.x, toe.y - 0.07, toe.z), "foot_" + side, 0.05),
    ]
    if side == "L":
        # the pointing finger (index of the free hand)
        base = (fi.x, fi.y - 0.045, fi.z + 0.036)
        BONES += [
            ("index1_L", base, (base[0], base[1] - 0.04, base[2]), "hand_L", 0.02),
            ("index2_L", (base[0], base[1] - 0.04, base[2]), (base[0], base[1] - 0.078, base[2]), "index1_L", 0.02),
        ]
RADIUS = {b[0]: b[4] for b in BONES}
DEFORM = [b[0] for b in BONES if b[4] > 0]


def build_armature(name="ManagerRig"):
    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    for bname, head, tail, parent, radius in BONES:
        b = eb.new(bname)
        b.head = Vector(head)
        b.tail = Vector(tail)
        b.roll = 0.0
        if parent:
            b.parent = eb[parent]
        b.use_deform = radius > 0
    # roll: keep every bone's local X aligned with world X where possible, so
    # the animation tables can think in world axes (anim.py converts anyway)
    for b in eb:
        b.roll = 0.0
    bpy.ops.object.mode_set(mode="OBJECT")
    arm_data.display_type = "OCTAHEDRAL"
    return arm


# --------------------------------------------------------------------------
# skinning
# --------------------------------------------------------------------------

def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def proximity_weights(obj, arm, bones=None, top=3):
    """Envelope-like fallback: smooth falloff from each bone segment."""
    bones = bones or DEFORM
    segs = {}
    for b in arm.data.bones:
        if b.name in bones:
            segs[b.name] = (Vector(b.head_local), Vector(b.tail_local), RADIUS[b.name])
    groups = {n: obj.vertex_groups.get(n) or obj.vertex_groups.new(name=n) for n in segs}
    for v in obj.data.vertices:
        p = v.co
        ws = []
        for n, (a, b, r) in segs.items():
            d = _seg_dist(p, a, b)
            ws.append((math.exp(-((d / r) ** 2) * 2.2), n))
        ws.sort(reverse=True)
        ws = ws[:top]
        tot = sum(w for w, _ in ws) or 1.0
        for w, n in ws:
            if w / tot > 0.01:
                groups[n].add([v.index], w / tot, "REPLACE")


def heat_weights(obj, arm):
    """Blender's bone-heat automatic weights. Returns False if it failed."""
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try:
        with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[obj, arm],
                                       selected_editable_objects=[obj, arm]):
            bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except RuntimeError as e:
        print("heat weights failed on %s: %s" % (obj.name, e))
        return False
    # sanity: every vertex must have carried some weight
    idx = {vg.index for vg in obj.vertex_groups}
    for v in obj.data.vertices:
        if not any(g.group in idx and g.weight > 0.0 for g in v.groups):
            print("heat weights left a vertex empty on %s" % obj.name)
            return False
    return True


def rigid_weights(obj, bone):
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    vg = obj.vertex_groups.new(name=bone)
    vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")


def attach(obj, arm):
    """Parent obj to arm with an Armature modifier (weights already set)."""
    obj.parent = arm
    obj.matrix_parent_inverse = Matrix.Identity(4)
    if not any(m.type == "ARMATURE" for m in obj.modifiers):
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        mod.use_vertex_groups = True


def skin_parts(parts, arm):
    """Weight every part. Deforming shells get heat weights (proximity as the
    fallback), rigid props are pinned to the joint named in their "bone" tag."""
    torso_only = ("Suspenders", "Suspender_brass", "Back_patch", "Tie", "Pocket", "Belt", "Buckle")
    for name, obj in parts.items():
        if obj.get("bone"):
            rigid_weights(obj, obj["bone"])
            attach(obj, arm)
            continue
        if name in torso_only:
            # straps and the tie must not follow the arms
            proximity_weights(obj, arm, bones=("hips", "spine", "chest", "neck"), top=2)
            attach(obj, arm)
            print("skinned %-16s torso" % name)
            continue
        ok = heat_weights(obj, arm)
        if not ok:
            for vg in list(obj.vertex_groups):
                obj.vertex_groups.remove(vg)
            proximity_weights(obj, arm)
        attach(obj, arm)
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
            bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
        print("skinned %-16s %s" % (name, "heat" if ok else "proximity"))
    # the pointing finger belongs to its own bones whatever heat decided
    skin = parts["Skin"]
    finger_bones = ["index1_L", "index2_L"]
    fb = {n: (Vector(arm.data.bones[n].head_local), Vector(arm.data.bones[n].tail_local)) for n in finger_bones}
    groups = {n: skin.vertex_groups.get(n) or skin.vertex_groups.new(name=n) for n in finger_bones}
    hand = skin.vertex_groups.get("hand_L") or skin.vertex_groups.new(name="hand_L")
    for v in skin.data.vertices:
        d = {n: _seg_dist(v.co, a, b) for n, (a, b) in fb.items()}
        best = min(d, key=d.get)
        if d[best] < 0.024 and v.co.y < fb["index1_L"][0].y + 0.005:
            for g in v.groups:
                pass
            for vg in skin.vertex_groups:
                if vg.name not in finger_bones:
                    try:
                        vg.remove([v.index])
                    except RuntimeError:
                        pass
            # blend between the two finger bones near the knuckle
            t = max(0.0, min(1.0, (fb["index1_L"][0].y - v.co.y - 0.03) / 0.02))
            groups["index1_L"].add([v.index], 1.0 - t, "REPLACE")
            groups["index2_L"].add([v.index], t, "REPLACE")
            if t == 0.0 and (fb["index1_L"][0].y - v.co.y) < 0.008:
                hand.add([v.index], 0.5, "REPLACE")
                groups["index1_L"].add([v.index], 0.5, "REPLACE")


def parent_to_bone(obj, arm, bone, world_matrix):
    """Bone-parent obj so that it sits at world_matrix in the current pose."""
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone]
    # bone parenting is relative to the bone's tail
    bone_world = arm.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.length, 0))
    obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.matrix_basis = bone_world.inverted() @ world_matrix
