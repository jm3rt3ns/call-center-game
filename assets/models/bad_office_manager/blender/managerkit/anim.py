"""Animation: CMU mocap retargeting for the locomotion cycles and hand-authored
pose tables for everything else. Rotations in the tables are degrees about
the armature's world axes, applied relative to the parent bone:

    X  spine/head: + leans forward     arms/legs (pointing down): + swings back
    Y  arms: + moves the limb toward his right (-X)
    Z  + turns toward his left (+X)
"""

import math
import os

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

from .measure import J

FPS = 30


# --------------------------------------------------------------------------
# pose application
# --------------------------------------------------------------------------

def _rest_rot(arm, name):
    return arm.data.bones[name].matrix_local.to_3x3()


def set_bone(arm, name, rot_deg=(0, 0, 0), loc=None):
    """Rotate a bone by rot_deg about armature axes (relative to its parent)."""
    pb = arm.pose.bones[name]
    r = Euler([math.radians(a) for a in rot_deg], "XYZ").to_matrix()
    rest = _rest_rot(arm, name)
    basis = rest.inverted() @ r @ rest
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = basis.to_quaternion()
    if loc is not None:
        pb.location = rest.inverted() @ Vector(loc)
    else:
        pb.location = (0, 0, 0)


def apply_pose(arm, pose):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    for name, val in pose.items():
        if isinstance(val, dict):
            set_bone(arm, name, val.get("rot", (0, 0, 0)), val.get("loc"))
        else:
            set_bone(arm, name, val)


def key_pose(arm, action, frame, pose):
    apply_pose(arm, pose)
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame, group=pb.name)
        pb.keyframe_insert("location", frame=frame, group=pb.name)


def new_action(arm, name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    return act


def finish_action(arm, act, length_s, loop, hold=0.25, interp="BEZIER"):
    """Trim the frame range, add the one-shot hold and set interpolation."""
    end = round(length_s * FPS)
    if not loop and hold:
        # hold the final pose (spec SS9.3) so the reaction reads mid-run
        for fc in act.fcurves:
            last = fc.keyframe_points[-1]
            fc.keyframe_points.insert(end + round(hold * FPS), last.co[1])
        end += round(hold * FPS)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            kp.easing = "AUTO"
        if loop:
            m = fc.modifiers.new("CYCLES")
    act.frame_range = (1, max(2, end + 1))
    act.use_frame_range = True
    act["loop"] = loop
    return act


def author(arm, name, keys, loop, hold=0.25, base=None):
    """keys: list of (time_seconds, pose_dict). Poses are merged over base."""
    act = new_action(arm, name)
    base = dict(base or {})
    for t, pose in keys:
        p = dict(base)
        p.update(pose)
        key_pose(arm, act, 1 + round(t * FPS), p)
    return finish_action(arm, act, keys[-1][0], loop, hold)


# --------------------------------------------------------------------------
# pose vocabulary
# --------------------------------------------------------------------------

def curl(index1=-80, index2=-95):
    """The pointing finger folded into the fist."""
    return {"index1_L": (0, 0, index1), "index2_L": (0, 0, index2)}


def hold_mug():
    """Right forearm up in front of the hip, fist gripping the mug."""
    return {
        "upper_arm_R": (8, -4, 0),
        "forearm_R": (-58, 0, 16),
        "hand_R": (0, -12, 8),
    }


STAND = {
    "upper_arm_L": (4, 6, 0),
    "forearm_L": (-8, 0, 0),
    "upper_arm_R": (4, -6, 0),
    "forearm_R": (-8, 0, 0),
    "head": (2, 0, 0),
    "spine": (1, 0, 0),
    **curl(),
}
STAND_MUG = {**STAND, **hold_mug()}


def lerp_pose(a, b, t):
    out = dict(a)
    for k, v in b.items():
        va = a.get(k, (0, 0, 0))
        if isinstance(v, dict) or isinstance(va, dict):
            out[k] = v
        else:
            out[k] = tuple(va[i] + (v[i] - va[i]) * t for i in range(3))
    return out


def rot(**kw):
    return kw


# --------------------------------------------------------------------------
# clips
# --------------------------------------------------------------------------

def clip_idle(arm):
    a = dict(STAND_MUG)
    b = lerp_pose(a, {"spine": (2.5, 0, 0), "chest": (1.5, 0, 0), "head": (-1, 0, 4),
                      "forearm_R": (-80, 0, 34), "upper_arm_L": (5, 8, 0), "clav_L": (0, 0, 0),
                      "hips": {"rot": (0, 0, 0), "loc": (0, 0, -0.006)}}, 1.0)
    c = lerp_pose(a, {"head": (3, 0, -3), "chest": (0, 0, -2), "forearm_R": (-76, 0, 34)}, 1.0)
    keys = [(0.0, a), (0.9, b), (1.7, c), (2.6, a)]
    return author(arm, "idle", keys, loop=True)


def clip_arms_crossed(arm):
    crossed = {
        **STAND,
        "clav_L": (0, 0, 0), "clav_R": (0, 0, 0),
        "upper_arm_L": (-15, 15, 0), "forearm_L": (-75, 0, -80), "hand_L": (0, 0, -20),
        "upper_arm_R": (-30, -15, 0), "forearm_R": (-60, 0, 100), "hand_R": (0, 0, 20),
        "chest": (-4, 0, 0), "head": (6, 0, 0),
    }
    b = lerp_pose(crossed, {"chest": (-6, 0, 0), "head": (5, 0, 6)}, 1.0)
    c = lerp_pose(crossed, {"chest": (-3, 0, 0), "head": (7, 0, -4)}, 1.0)
    return author(arm, "arms_crossed", [(0, crossed), (1.0, b), (2.0, c), (3.0, crossed)], loop=True)


def clip_talk(arm):
    a = {**STAND_MUG, "upper_arm_L": (-30, 20, 0), "forearm_L": (-70, 0, -30), "hand_L": (0, 0, 20),
         **curl(-10, -20), "head": (2, 0, 6), "chest": (0, 0, 4)}
    b = {**STAND_MUG, "upper_arm_L": (-50, 30, 0), "forearm_L": (-40, 0, -10), "hand_L": (20, 0, 0),
         **curl(-10, -20), "head": (4, 0, -6), "chest": (0, 0, -3)}
    c = {**STAND_MUG, "upper_arm_L": (0, -30, 0), "forearm_L": (-60, 0, -80), "hand_L": (0, 0, -20),
         "head": (0, 0, 8), "chest": (-3, 0, 2)}   # hand on hip
    d = lerp_pose(c, {"head": (6, 0, 0), "chest": (-4, 0, 0)}, 1.0)
    keys = [(0, STAND_MUG), (0.4, a), (0.9, b), (1.3, a), (1.9, c), (2.4, d), (3.0, STAND_MUG)]
    return author(arm, "talk", keys, loop=True)


def clip_angry(arm):
    up = {**STAND, "upper_arm_L": (-15, -45, 0), "forearm_L": (-135, 0, -20), "hand_L": (-20, 0, 0),
          "upper_arm_R": (-15, 45, 0), "forearm_R": (-135, 0, 20), "hand_R": (-20, 0, 0),
          "chest": (-10, 0, 0), "spine": (-6, 0, 0), "head": (-12, 0, 0),
          "hips": {"rot": (0, 0, 0), "loc": (0, 0, 0.0)}}
    down = {**STAND, "upper_arm_L": (-40, -30, 0), "forearm_L": (-120, 0, -25), "hand_L": (-20, 0, 0),
            "upper_arm_R": (-40, 30, 0), "forearm_R": (-120, 0, 25), "hand_R": (-20, 0, 0),
            "chest": (16, 0, 0), "spine": (8, 0, 0), "head": (14, 0, 0),
            "hips": {"rot": (0, 0, 0), "loc": (0, 0, -0.03)}}
    shake_l = lerp_pose(down, {"head": (14, 0, 6), "chest": (16, 0, 3)}, 1.0)
    shake_r = lerp_pose(down, {"head": (14, 0, -6), "chest": (16, 0, -3)}, 1.0)
    keys = [(0, STAND_MUG), (0.3, up), (0.5, down), (0.65, shake_l), (0.8, shake_r), (0.95, shake_l),
            (1.1, shake_r), (1.3, down), (1.55, STAND_MUG)]
    return author(arm, "angry", keys, loop=False)


def clip_slam(arm):
    raise_ = {**STAND_MUG, "upper_arm_L": (-120, 30, 0), "forearm_L": (-40, 0, 0), "hand_L": (-30, 0, 0),
              "chest": (-8, 0, 0), "spine": (-4, 0, 0), "head": (-6, 0, 0)}
    slam = {**STAND_MUG, "upper_arm_L": (-40, 10, 0), "forearm_L": (-25, 0, 0), "hand_L": (30, 0, 0),
            "chest": (22, 0, 0), "spine": (12, 0, 0), "head": (10, 0, 0),
            "hips": {"rot": (0, 0, 0), "loc": (0, 0, -0.05)}, "thigh_L": (-12, 0, 0), "thigh_R": (-12, 0, 0),
            "shin_L": (18, 0, 0), "shin_R": (18, 0, 0)}
    bounce = lerp_pose(slam, {"chest": (14, 0, 0), "spine": (8, 0, 0), "head": (4, 0, 0),
                              "hips": {"rot": (0, 0, 0), "loc": (0, 0, -0.03)}}, 1.0)
    keys = [(0, STAND_MUG), (0.35, raise_), (0.55, slam), (0.7, bounce), (0.85, slam), (1.2, STAND_MUG)]
    return author(arm, "slam", keys, loop=False)


def clip_command(arm):
    """Pointed finger: the spec's `command`, the sheet's FIRING / POINTING."""
    point = {**STAND_MUG, "upper_arm_L": (-85, 10, 8), "forearm_L": (-5, 0, 0), "hand_L": (0, 0, 0),
             "index1_L": (0, 0, 0), "index2_L": (0, 0, 0),
             "chest": (6, 0, -8), "spine": (3, 0, -4), "head": (4, 0, -6)}
    jab = lerp_pose(point, {"upper_arm_L": (-95, 8, 8), "chest": (12, 0, -10), "spine": (6, 0, -5),
                            "head": (8, 0, -8)}, 1.0)
    keys = [(0, STAND_MUG), (0.3, point), (0.5, jab), (0.65, point), (0.85, jab), (1.0, point), (1.3, STAND_MUG)]
    return author(arm, "command", keys, loop=False)


def clip_celebrate(arm):
    pump = {**STAND, "upper_arm_L": (-160, -20, 0), "forearm_L": (-40, 0, -10), "hand_L": (-20, 0, 0),
            "upper_arm_R": (10, -20, 0), "forearm_R": (-60, 0, 20),
            "chest": (-8, 0, 6), "spine": (-4, 0, 3), "head": (-8, 0, -6)}
    pump2 = {**STAND, "upper_arm_L": (-110, -20, 0), "forearm_L": (-90, 0, -20), "hand_L": (0, 0, 0),
             "upper_arm_R": (10, -20, 0), "forearm_R": (-60, 0, 20),
             "chest": (0, 0, -4), "spine": (0, 0, -2), "head": (0, 0, 6),
             "hips": {"rot": (0, 0, 0), "loc": (0, 0, -0.02)}}
    smug = {**STAND, "upper_arm_L": (0, -30, 0), "forearm_L": (-60, 0, -80), "hand_L": (0, 0, -20),
            "upper_arm_R": (0, 30, 0), "forearm_R": (-60, 0, 80), "hand_R": (0, 0, 20),
            "chest": (-10, 0, 0), "spine": (-4, 0, 0), "head": (-10, 0, 8)}
    keys = [(0, smug), (0.35, pump), (0.6, pump2), (0.85, pump), (1.1, pump2), (1.45, smug), (1.8, smug)]
    return author(arm, "celebrate", keys, loop=True)


def clip_hit(arm):
    recoil = {**STAND_MUG, "chest": (-18, 0, 6), "spine": (-8, 0, 0), "head": (-22, 0, 10),
              "upper_arm_L": (-40, 40, 0), "forearm_L": (-60, 0, 0), "upper_arm_R": (-10, -30, 0),
              "hips": {"rot": (0, 0, 0), "loc": (0, 0.06, -0.02)}, "thigh_L": (10, 0, 0), "thigh_R": (-6, 0, 0),
              "shin_L": (10, 0, 0)}
    stagger = {**STAND_MUG, "chest": (-6, 0, -4), "spine": (-2, 0, 0), "head": (6, 0, -6),
               "hips": {"rot": (0, 0, 0), "loc": (0, 0.04, -0.03)}, "thigh_L": (4, 0, 0), "thigh_R": (-12, 0, 0),
               "shin_R": (16, 0, 0)}
    keys = [(0, STAND_MUG), (0.12, recoil), (0.4, stagger), (0.8, STAND_MUG)]
    return author(arm, "hit", keys, loop=False)


def lying_pose():
    """On his back on the floor, feet toward -Y (where he was facing)."""
    return {
        "hips": {"rot": (-90, 0, 0), "loc": (0, 0.25, -(J["hips"][2] - 0.14))},
        "spine": (-4, 0, 0), "chest": (-4, 0, 0), "neck": (-10, 0, 0), "head": (-14, 0, 0),
        "upper_arm_L": (30, 30, 0), "forearm_L": (-40, 0, -10), "hand_L": (0, 0, 0),
        "upper_arm_R": (30, -30, 0), "forearm_R": (-40, 0, 10), "hand_R": (0, 0, 0),
        "thigh_L": (-6, 6, 0), "thigh_R": (-6, -6, 0), "shin_L": (18, 0, 0), "shin_R": (12, 0, 0),
        "foot_L": (20, 0, 0), "foot_R": (20, 0, 0), **curl(),
    }


def clip_fall(arm):
    lying = lying_pose()
    stagger = {**STAND_MUG, "chest": (-16, 0, 0), "spine": (-8, 0, 0), "head": (-10, 0, 0),
               "upper_arm_L": (-40, 40, 0), "forearm_L": (-30, 0, 0), "upper_arm_R": (-40, -40, 0),
               "forearm_R": (-30, 0, 0), "hips": {"rot": (-8, 0, 0), "loc": (0, 0.05, -0.04)},
               "thigh_L": (-10, 0, 0), "thigh_R": (16, 0, 0), "shin_R": (24, 0, 0), "shin_L": (14, 0, 0)}
    mid = {**stagger, "hips": {"rot": (-55, 0, 0), "loc": (0, 0.18, -0.45)},
           "thigh_L": (-30, 6, 0), "thigh_R": (-20, -6, 0), "shin_L": (50, 0, 0), "shin_R": (40, 0, 0),
           "chest": (-10, 0, 0), "head": (-20, 0, 0),
           "upper_arm_L": (20, 40, 0), "upper_arm_R": (20, -40, 0), "forearm_L": (-60, 0, 0), "forearm_R": (-60, 0, 0)}
    impact = dict(lying)
    impact["chest"] = (10, 0, 0)
    impact["head"] = (6, 0, 0)
    impact["hips"] = {"rot": (-90, 0, 0), "loc": (0, 0.25, -(J["hips"][2] - 0.16))}
    keys = [(0, STAND_MUG), (0.25, stagger), (0.6, mid), (0.85, impact), (1.05, lying), (1.5, lying)]
    return author(arm, "fall", keys, loop=False, hold=0.0)


def clip_dead(arm):
    lying = lying_pose()
    twitch = lerp_pose(lying, {"chest": (-2, 0, 0), "head": (-16, 0, 6), "forearm_L": (-46, 0, 10),
                               "foot_L": (26, 0, 0)}, 1.0)
    twitch2 = lerp_pose(lying, {"head": (-13, 0, -4), "hand_R": (10, 0, 0), "foot_R": (24, 0, 0)}, 1.0)
    keys = [(0, lying), (1.0, twitch), (1.4, lying), (2.2, twitch2), (3.0, lying)]
    return author(arm, "dead", keys, loop=True)


def clip_get_up(arm):
    lying = lying_pose()
    sit = {**STAND_MUG, "hips": {"rot": (-20, 0, 0), "loc": (0, 0.20, -(J["hips"][2] - 0.28))},
           "spine": (20, 0, 0), "chest": (16, 0, 0), "head": (-6, 0, 0),
           "thigh_L": (-70, 8, 0), "thigh_R": (-60, -8, 0), "shin_L": (90, 0, 0), "shin_R": (80, 0, 0),
           "upper_arm_L": (40, 30, 0), "forearm_L": (-20, 0, 0), "upper_arm_R": (40, -30, 0), "forearm_R": (-20, 0, 0)}
    crouch = {**STAND_MUG, "hips": {"rot": (10, 0, 0), "loc": (0, 0.05, -0.35)},
              "spine": (24, 0, 0), "chest": (10, 0, 0), "head": (-14, 0, 0),
              "thigh_L": (-80, 6, 0), "thigh_R": (-80, -6, 0), "shin_L": (110, 0, 0), "shin_R": (110, 0, 0),
              "foot_L": (-25, 0, 0), "foot_R": (-25, 0, 0),
              "upper_arm_L": (20, 20, 0), "forearm_L": (-40, 0, 0), "upper_arm_R": (20, -20, 0), "forearm_R": (-40, 0, 0)}
    keys = [(0, lying), (0.5, sit), (1.0, crouch), (1.5, STAND_MUG)]
    return author(arm, "get_up", keys, loop=False)


def clip_interact(arm):
    """Paperwork: pick a sheet up in front of him and read it."""
    reach = {**STAND_MUG, "upper_arm_L": (-50, 10, 0), "forearm_L": (-30, 0, -20), "hand_L": (20, 0, 0),
             "chest": (14, 0, 0), "spine": (8, 0, 0), "head": (16, 0, 0), **curl(-40, -50)}
    read = {**STAND_MUG, "upper_arm_L": (0, 0, 0), "forearm_L": (-90, 0, -40), "hand_L": (30, 0, -10),
            "chest": (4, 0, 0), "spine": (2, 0, 0), "head": (20, 0, -4), **curl(-40, -50)}
    read2 = lerp_pose(read, {"head": (20, 0, 4), "chest": (5, 0, 2)}, 1.0)
    keys = [(0, STAND_MUG), (0.4, reach), (0.8, read), (1.4, read2), (2.0, read), (2.5, STAND_MUG)]
    return author(arm, "interact", keys, loop=False)


# --------------------------------------------------------------------------
# mocap retargeting
# --------------------------------------------------------------------------

# my bone -> (bvh joint whose direction it copies)
RETARGET = {
    "spine": "Spine", "chest": "Neck", "neck": "Neck1", "head": "Head",
    "clav_L": "LeftShoulder", "upper_arm_L": "LeftArm", "forearm_L": "LeftForeArm", "hand_L": "LeftHand",
    "clav_R": "RightShoulder", "upper_arm_R": "RightArm", "forearm_R": "RightForeArm", "hand_R": "RightHand",
    "thigh_L": "LeftUpLeg", "shin_L": "LeftLeg", "foot_L": "LeftFoot", "toe_L": "LeftToeBase",
    "thigh_R": "RightUpLeg", "shin_R": "RightLeg", "foot_R": "RightFoot", "toe_R": "RightToeBase",
}
BVH_UNIT = 0.0575  # metres per CMU unit, from the hip height ratio


def import_bvh(path):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, axis_forward="-Z", axis_up="Y", global_scale=1.0,
                            frame_start=1, use_fps_scale=False, update_scene_fps=False,
                            update_scene_duration=False)
    src = [o for o in bpy.data.objects if o not in before][0]
    # keep it in the depsgraph (hide_viewport would stop the pose evaluating)
    src.hide_render = True
    src["no_export"] = True
    n = len(src.animation_data.action.fcurves[0].keyframe_points)
    return src, n


def _joint_dirs(src, frame):
    bpy.context.scene.frame_set(frame)
    out = {}
    for pb in src.pose.bones:
        h = src.matrix_world @ pb.head
        t = src.matrix_world @ pb.tail
        out[pb.name] = (h, (t - h).normalized())
    hips = src.pose.bones["Hips"]
    rot = (src.matrix_world @ hips.matrix).to_3x3() @ src.data.bones["Hips"].matrix_local.to_3x3().inverted()
    return out, rot, src.matrix_world @ hips.head


def find_cycle(src, n_frames, bvh_fps=120):
    """Stride period from the left-minus-right foot signal (first
    autocorrelation peak after the anti-phase dip) and a start frame at the
    left foot's furthest-forward point."""
    import numpy as np

    ys = []
    for f in range(1, n_frames + 1):
        d, _, hip = _joint_dirs(src, f)
        ys.append(d["LeftFoot"][0].y - d["RightFoot"][0].y)
    s = np.array(ys) - np.mean(ys)
    lags = range(int(0.3 * bvh_fps), min(int(2.5 * bvh_fps), n_frames // 2))
    c = {p: float(np.dot(s[:-p], s[p:]) / max(1, len(s) - p)) for p in lags}
    dipped = False
    best_p, best = None, -1e18
    for p in lags:
        if c[p] < 0:
            dipped = True
        if dipped and c[p] > best:
            best, best_p = c[p], p
    if best_p is None:
        best_p = max(c, key=c.get)
    # start: left foot furthest forward (-y), away from the clip edges
    lo, hi = int(0.1 * n_frames), n_frames - best_p - 1
    start = lo + int(np.argmin(s[lo:hi]))
    return start + 1, best_p


def retarget(arm, src, name, start, period, bvh_fps=120, overrides=None, hip_bob=1.0, loop=True):
    """Bake one gait cycle from the BVH armature onto ours as an action."""
    act = new_action(arm, name)
    order = [b.name for b in arm.data.bones]
    rest = {n: arm.data.bones[n].matrix_local.copy() for n in order}
    parent = {n: (arm.data.bones[n].parent.name if arm.data.bones[n].parent else None) for n in order}
    length_s = period / bvh_fps
    n_keys = max(4, round(length_s * FPS))
    # average hip height over the cycle -> vertical bob only
    hip_zs = [_joint_dirs(src, start + int(i * period / n_keys))[2].z for i in range(n_keys)]
    hip_mean = sum(hip_zs) / len(hip_zs)
    for i in range(n_keys + 1):
        f = start + int(round((i % n_keys) * period / n_keys))
        dirs, hips_rot, hip = _joint_dirs(src, f)
        pose_mat = {}
        for n in order:
            if n == "root":
                pose_mat[n] = rest[n].copy()
                continue
            if n == "hips":
                R = hips_rot
                head = Vector(J["hips"]) + Vector((0, 0, (hip.z - hip_mean) * BVH_UNIT * hip_bob))
            elif n in RETARGET:
                d_rest = (arm.data.bones[n].tail_local - arm.data.bones[n].head_local).normalized()
                d_tgt = dirs[RETARGET[n]][1]
                R = d_rest.rotation_difference(d_tgt).to_matrix()
                head = None
            else:
                R = Matrix.Identity(3)
                head = None
            if head is None:
                pm = pose_mat[parent[n]]
                head = pm @ (rest[parent[n]].inverted() @ arm.data.bones[n].head_local)
            pose_mat[n] = Matrix.Translation(head) @ (R @ rest[n].to_3x3()).to_4x4()
        frame = 1 + i * FPS * length_s / n_keys
        for n in order:
            pb = arm.pose.bones[n]
            pb.rotation_mode = "QUATERNION"
            if parent[n]:
                local_parent = pose_mat[parent[n]] @ rest[parent[n]].inverted() @ rest[n]
            else:
                local_parent = rest[n]
            basis = local_parent.inverted() @ pose_mat[n]
            pb.rotation_quaternion = basis.to_quaternion()
            pb.location = basis.to_translation()
        if overrides:
            for n, val in overrides.items():
                set_bone(arm, n, val.get("rot", (0, 0, 0)) if isinstance(val, dict) else val,
                         val.get("loc") if isinstance(val, dict) else None)
        for n in order:
            pb = arm.pose.bones[n]
            pb.keyframe_insert("rotation_quaternion", frame=frame, group=n)
            pb.keyframe_insert("location", frame=frame, group=n)
    return finish_action(arm, act, length_s, loop, hold=0.0, interp="LINEAR")


def build_locomotion(arm, bvh_dir):
    clips = {}
    walk_src, n = import_bvh(os.path.join(bvh_dir, "02_01.bvh"))
    start, period = find_cycle(walk_src, n)
    print("walk cycle: start %d period %d (%.2fs)" % (start, period, period / 120))
    clips["walk"] = retarget(arm, walk_src, "walk", start, period)
    clips["walk_coffee"] = retarget(arm, walk_src, "walk_coffee", start, period, overrides=hold_mug())
    run_src, n = import_bvh(os.path.join(bvh_dir, "09_01.bvh"))
    start, period = find_cycle(run_src, n)
    print("run cycle: start %d period %d (%.2fs)" % (start, period, period / 120))
    clips["run"] = retarget(arm, run_src, "run", start, period)
    for src in (walk_src, run_src):
        bpy.data.objects.remove(src)
    return clips


def build_all(arm, bvh_dir):
    clips = {}
    clips["idle"] = clip_idle(arm)
    clips.update(build_locomotion(arm, bvh_dir))
    for fn in (clip_talk, clip_angry, clip_slam, clip_arms_crossed, clip_command, clip_hit, clip_fall,
               clip_get_up, clip_celebrate, clip_interact, clip_dead):
        act = fn(arm)
        clips[act.name] = act
    # one NLA track per clip so the glTF exporter writes them all
    arm.animation_data.action = None
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)
    for name, act in clips.items():
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(act.frame_range[0]), act)
        strip.name = name
        track.mute = True
    return clips
