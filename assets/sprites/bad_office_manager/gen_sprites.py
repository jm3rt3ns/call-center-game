"""
Bad Office Manager — procedural pixel-art animation set.
Canvas 48x48 per frame (character is ~32x44; extra room for fall/die/props).
Front-facing 3/4 style like the concept sheet.
"""
import json, math, os, shutil
from PIL import Image, ImageDraw

OUT = "/home/claude/out/bad_office_manager_sprites"
W = H = 48
SCALE_PREVIEW = 4

# ---------------- palette (from the concept sheet) ----------------
P = {
    "skin":    (229, 181, 153), "skin_d": (216, 149, 92),
    "hair":    (192, 139, 74),  "hair_d": (150, 105, 55),
    "shirt":   (185, 192, 224), "shirt_d": (122, 136, 181),
    "white":   (229, 229, 234),
    "susp":    (124, 58, 61),   "susp_d": (90, 42, 46),
    "tie":     (196, 150, 70),  "tie_d": (150, 110, 50),
    "pants":   (58, 68, 83),    "pants_d": (35, 43, 58),
    "belt":    (34, 34, 34),    "buckle": (196, 150, 70),
    "shoe":    (20, 24, 31),    "shoe_h": (58, 68, 83),
    "glass":   (28, 32, 40),    "lens":   (200, 215, 235),
    "black":   (20, 20, 22),    "mug":    (229, 229, 234), "mug_d": (150, 150, 160),
    "paper":   (240, 240, 240), "desk":   (90, 62, 40),   "desk_d": (60, 40, 25),
    "line":    (28, 32, 40),    "red":    (200, 60, 50),  "coffee": (80, 50, 30),
}
TRANSPARENT = (0, 0, 0, 0)

# ---------------- base pose ----------------
def base_pose():
    return dict(
        bob=0, head_dx=0, head_dy=0, lean=0, squash=0,
        # arms: (elbow_dx, elbow_dy, hand_dx, hand_dy) relative to shoulder, screen space
        arm_l=(-2, 7, -1, 7), arm_r=(2, 7, 1, 7),
        # legs: (knee_dx, knee_dy, foot_dx, foot_dy) relative to hip
        leg_l=(0, 7, 0, 7), leg_r=(0, 7, 0, 7),
        mouth="neutral", brow="neutral", eyes="open",
        props=set(), rot=0, dx=0, dy=0,
        arm_l_front=False, arm_r_front=True,   # draw order
    )

def lerp(a, b, t):
    if isinstance(a, tuple):
        return tuple(lerp(x, y, t) for x, y in zip(a, b))
    if isinstance(a, (int, float)):
        return a + (b - a) * t
    return b if t >= 0.5 else a

def ease(t):  # smoothstep for cleaner motion arcs
    return t * t * (3 - 2 * t)

def blend(pa, pb, t, e=True):
    t = ease(t) if e else t
    out = {}
    for k in pa:
        out[k] = lerp(pa[k], pb[k], t) if k not in ("props", "mouth", "brow", "eyes",
                                                   "arm_l_front", "arm_r_front") \
                 else (pb[k] if t >= 0.5 else pa[k])
    return out

def R(v): return int(round(v))

# ---------------- drawing ----------------
def thick(d, p0, p1, w, col):
    d.line([p0, p1], fill=col, width=w)
    r = w // 2
    for (x, y) in (p0, p1):
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)

def draw_character(pose):
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    d = ImageDraw.Draw(img)
    cx = 24 + pose["dx"]
    ground = 45 + pose["dy"]
    bob = pose["bob"]
    sq = pose["squash"]
    lean = pose["lean"]

    # key y levels (screen, feet at ground)
    hip_y   = ground - 14 + bob
    belt_y  = hip_y - 1
    torso_top = belt_y - 15 + sq
    head_top  = torso_top - 12 + pose["head_dy"]
    hcx = cx + pose["head_dx"] + lean

    # ---------- legs ----------
    def leg(hx, spec, front):
        kdx, kdy, fdx, fdy = spec
        k = (R(hx + kdx), R(hip_y + kdy))
        f = (R(k[0] + fdx), R(k[1] + fdy))
        col = P["pants"] if front else P["pants_d"]
        thick(d, (R(hx), R(hip_y)), k, 6, col)
        thick(d, k, f, 6, col)
        # shoe
        d.rectangle([f[0] - 4, f[1] - 1, f[0] + 3, f[1] + 2], fill=P["shoe"])
        d.line([(f[0] - 4, f[1] - 1), (f[0] + 3, f[1] - 1)], fill=P["shoe_h"])
    leg(cx - 4, pose["leg_l"], False)
    leg(cx + 4, pose["leg_r"], True)

    # ---------- arms (back) ----------
    sh_l = (cx - 10 + lean, torso_top + 4)
    sh_r = (cx + 10 + lean, torso_top + 4)
    def arm(sh, spec, watch):
        edx, edy, hdx, hdy = spec
        e = (R(sh[0] + edx), R(sh[1] + edy))
        h = (R(e[0] + hdx), R(e[1] + hdy))
        thick(d, (R(sh[0]), R(sh[1])), e, 6, P["shirt"])     # sleeve (upper arm)
        thick(d, e, h, 5, P["skin"])                          # forearm
        if watch:
            d.line([(h[0]-2, h[1]-2), (h[0]+2, h[1]-2)], fill=P["tie_d"])
        d.ellipse([h[0] - 2, h[1] - 2, h[0] + 2, h[1] + 2], fill=P["skin_d"])
        return h
    hand_pos = {}
    if not pose["arm_l_front"]:
        hand_pos["l"] = arm(sh_l, pose["arm_l"], True)
    if not pose["arm_r_front"]:
        hand_pos["r"] = arm(sh_r, pose["arm_r"], False)

    # ---------- torso ----------
    tl, tr = cx - 11 + lean, cx + 11 + lean
    d.polygon([(tl, torso_top), (tr, torso_top), (cx + 8, belt_y), (cx - 8, belt_y)], fill=P["shirt"])
    d.polygon([(tl, torso_top), (tl + 3, torso_top), (cx - 6, belt_y), (cx - 8, belt_y)], fill=P["shirt_d"])
    # pocket
    d.rectangle([cx - 5 + lean, torso_top + 5, cx - 2 + lean, torso_top + 8], outline=P["shirt_d"])
    # suspenders
    for sx in (cx - 5, cx + 5):
        d.line([(sx + lean, torso_top), (sx * 0.85 + cx * 0.15, belt_y)], fill=P["susp"], width=2)
    # collar + tie
    d.polygon([(hcx - 4, torso_top - 1), (hcx, torso_top + 3), (hcx + 4, torso_top - 1)], fill=P["white"])
    d.line([(hcx, torso_top + 2), (cx + lean * 0.4, belt_y - 2)], fill=P["tie"], width=2)
    d.point((hcx, torso_top + 3), fill=P["tie_d"])
    # belt
    d.rectangle([cx - 8, belt_y, cx + 8, belt_y + 1], fill=P["belt"])
    d.rectangle([cx - 1, belt_y, cx + 1, belt_y + 1], fill=P["buckle"])

    # ---------- neck + head ----------
    d.rectangle([hcx - 2, torso_top - 3, hcx + 2, torso_top], fill=P["skin_d"])
    ht = head_top
    # hair (flat top, shaved sides)
    d.rectangle([hcx - 5, ht, hcx + 5, ht + 2], fill=P["hair"])
    d.rectangle([hcx - 5, ht + 2, hcx - 5, ht + 4], fill=P["hair_d"])
    d.rectangle([hcx + 5, ht + 2, hcx + 5, ht + 4], fill=P["hair_d"])
    # face
    d.rectangle([hcx - 5, ht + 3, hcx + 5, ht + 10], fill=P["skin"])
    d.rectangle([hcx - 4, ht + 10, hcx + 4, ht + 11], fill=P["skin"])       # jaw
    d.line([(hcx - 4, ht + 11), (hcx + 4, ht + 11)], fill=P["skin_d"])
    # ears
    d.point((hcx - 6, ht + 6), fill=P["skin_d"]); d.point((hcx + 6, ht + 6), fill=P["skin_d"])
    # brows
    ey = ht + 5
    if pose["brow"] == "angry":
        d.line([(hcx - 4, ey - 1), (hcx - 2, ey)], fill=P["hair_d"])
        d.line([(hcx + 2, ey), (hcx + 4, ey - 1)], fill=P["hair_d"])
    else:
        d.line([(hcx - 4, ey - 1), (hcx - 2, ey - 1)], fill=P["hair_d"])
        d.line([(hcx + 2, ey - 1), (hcx + 4, ey - 1)], fill=P["hair_d"])
    # glasses
    for gx in (hcx - 4, hcx + 1):
        d.rectangle([gx, ey, gx + 3, ey + 2], outline=P["glass"], fill=P["lens"])
        if pose["eyes"] == "open":
            d.point((gx + 2, ey + 1), fill=P["black"])
        elif pose["eyes"] == "x":
            d.point((gx + 1, ey + 1), fill=P["black"]); d.point((gx + 2, ey + 1), fill=P["black"])
        else:  # closed
            d.line([(gx + 1, ey + 2), (gx + 2, ey + 2)], fill=P["black"])
    d.point((hcx, ey + 1), fill=P["glass"])
    d.point((hcx - 5, ey + 1), fill=P["glass"]); d.point((hcx + 5, ey + 1), fill=P["glass"])
    # nose
    d.point((hcx, ey + 3), fill=P["skin_d"])
    # mouth
    my = ht + 9
    if pose["mouth"] == "neutral":
        d.line([(hcx - 2, my), (hcx + 2, my)], fill=P["skin_d"])
    elif pose["mouth"] == "frown":
        d.line([(hcx - 2, my + 1), (hcx - 1, my), (hcx + 1, my), (hcx + 2, my + 1)], fill=P["black"])
    elif pose["mouth"] == "open":
        d.rectangle([hcx - 2, my - 1, hcx + 2, my + 1], fill=P["black"])
        d.line([(hcx - 1, my - 1), (hcx + 1, my - 1)], fill=P["white"])
    elif pose["mouth"] == "smile":
        d.line([(hcx - 2, my - 1), (hcx - 1, my), (hcx + 1, my), (hcx + 2, my - 1)], fill=P["black"])
    elif pose["mouth"] == "smug":
        d.line([(hcx - 1, my), (hcx + 2, my), (hcx + 2, my - 1)], fill=P["black"])

    # ---------- arms (front) ----------
    if pose["arm_l_front"]:
        hand_pos["l"] = arm(sh_l, pose["arm_l"], True)
    if pose["arm_r_front"]:
        hand_pos["r"] = arm(sh_r, pose["arm_r"], False)

    # ---------- props ----------
    pr = pose["props"]
    if "mug" in pr and "r" in hand_pos:
        hx, hy = hand_pos["r"]
        d.rectangle([hx - 2, hy - 5, hx + 3, hy - 1], fill=P["mug"])
        d.line([(hx - 1, hy - 5), (hx + 2, hy - 5)], fill=P["coffee"])
        d.point((hx + 4, hy - 3), fill=P["mug_d"])
        d.point((hx, hy - 3), fill=P["red"])
    if "paper" in pr and "l" in hand_pos:
        hx, hy = hand_pos["l"]
        d.rectangle([hx - 3, hy - 6, hx + 2, hy - 1], fill=P["paper"])
        for i in range(3):
            d.line([(hx - 2, hy - 5 + i * 2 - 1), (hx + 1, hy - 5 + i * 2 - 1)], fill=P["mug_d"])
    if "sweat" in pr:
        d.point((hcx + 7, ht + 4), fill=P["lens"]); d.point((hcx + 7, ht + 5), fill=P["lens"])
    if "stars" in pr:
        for (sx, sy) in ((hcx - 8, ht - 3), (hcx + 8, ht - 2), (hcx, ht - 5)):
            d.point((sx, sy), fill=P["tie"]); d.point((sx + 1, sy), fill=P["tie"])
    if "angry_marks" in pr:
        d.line([(hcx + 8, ht - 2), (hcx + 10, ht - 4)], fill=P["red"])
        d.line([(hcx + 10, ht - 2), (hcx + 8, ht - 4)], fill=P["red"])

    # ---------- desk (drawn over legs, under arms would be nicer but keep simple) ----------
    if "desk" in pr:
        desk = Image.new("RGBA", (W, H), TRANSPARENT)
        dd = ImageDraw.Draw(desk)
        top = ground - 16
        dd.rectangle([2, top, 45, top + 2], fill=P["desk"])
        dd.rectangle([2, top + 3, 45, top + 12], fill=P["desk_d"])
        dd.rectangle([4, top + 4, 20, top + 11], fill=P["desk"])
        dd.rectangle([27, top + 4, 43, top + 11], fill=P["desk"])
        # monitor
        dd.rectangle([30, top - 9, 42, top - 1], fill=P["black"])
        dd.rectangle([31, top - 8, 41, top - 2], fill=P["shirt_d"])
        dd.rectangle([35, top - 1, 37, top], fill=P["black"])
        if "papers_desk" in pr:
            dd.rectangle([6, top - 2, 14, top], fill=P["paper"])
        if "shake" in pr:
            desk = desk.transform((W, H), Image.AFFINE, (1, 0, 0, 0, 1, -1))
        img = Image.alpha_composite(img, desk)

    if pose["rot"]:
        # rotate about the body centre on a big canvas, then refit bottom-aligned
        big = Image.new("RGBA", (W * 3, H * 3), TRANSPARENT)
        big.paste(img, (W, H))
        mid = (cx + W, (head_top + ground) / 2 + H)
        big = big.rotate(pose["rot"], resample=Image.NEAREST, center=mid)
        bb = big.getbbox()
        crop = big.crop(bb)
        out = Image.new("RGBA", (W, H), TRANSPARENT)
        ox = R((W - crop.width) / 2 + pose["dx"] * 0.3)
        oy = R(ground - crop.height + 1)
        out.paste(crop, (ox, oy))
        return out
    return img

# ---------------- animation definitions ----------------
def key(**kw):
    p = base_pose()
    p.update(kw)
    p["props"] = set(p["props"])
    return p

def interp(keys, n, loop=True):
    """keys: list of poses spaced evenly over the cycle; returns n frames."""
    frames = []
    segs = len(keys) if loop else len(keys) - 1
    for i in range(n):
        t = i / n if loop else i / (n - 1)
        s = min(int(t * segs), segs - 1)
        lt = t * segs - s
        a = keys[s]; b = keys[(s + 1) % len(keys)]
        frames.append(blend(a, b, lt))
    return frames

def sinus(n, amp, phase=0):
    return [amp * math.sin(2 * math.pi * i / n + phase) for i in range(n)]

ANIMS = {}

def add(name, frames, ms, loop):
    ANIMS[name] = dict(frames=frames, ms=ms, loop=loop)

# 1 IDLE — breathing bob, tiny head sway
add("01_idle", [key(bob=-R(0.6 + 0.6 * math.sin(2*math.pi*i/6)), squash=R(0.5 + 0.5*math.sin(2*math.pi*i/6 + 1)),
                    head_dx=0) for i in range(6)], 150, True)

# 2 WALK — legs alternate lifting, arms swing, body bob (front-facing 3/4 walk)
def walk_frames(n, stride, lift, arm_swing, bob_amp):
    fr = []
    for i in range(n):
        t = 2 * math.pi * i / n
        s = math.sin(t)
        c = math.cos(t)
        legL = (R(stride * s * 0.3), 7 - R(lift * max(0, s)), R(stride * s * 0.2), 7 - R(lift * max(0, s)))
        legR = (R(-stride * s * 0.3), 7 - R(lift * max(0, -s)), R(-stride * s * 0.2), 7 - R(lift * max(0, -s)))
        armL = (-2 + R(arm_swing * c * 0.6), 7 - R(abs(arm_swing * c) * 0.4), -1 + R(arm_swing * c), 7 - R(abs(arm_swing*c)*0.5))
        armR = (2 - R(arm_swing * c * 0.6), 7 - R(abs(arm_swing * c) * 0.4), 1 - R(arm_swing * c), 7 - R(abs(arm_swing*c)*0.5))
        fr.append(key(leg_l=legL, leg_r=legR, arm_l=armL, arm_r=armR,
                      bob=-R(bob_amp * abs(math.sin(t))), head_dx=R(1.2 * s), lean=R(1.5 * s)))
    return fr
add("02_walk", walk_frames(8, 4, 4, 3, 1), 110, True)

# 3 RUN — bigger stride, forward lean, more bob
def run_frames(n):
    fr = walk_frames(n, 6, 6, 5, 2)
    for f in fr:
        f["lean"] += 2
        f["head_dy"] += 1
        f["brow"] = "angry"; f["mouth"] = "frown"
    return fr
add("03_run", run_frames(8), 70, True)

# 4 TALK / GESTURE — point, wave, hand on hip
talk = [
    key(arm_r=(2, 7, 1, 7), arm_l=(-2, 7, -1, 7), mouth="open"),
    key(arm_r=(5, 2, 8, -3), arm_l=(-2, 7, -1, 7), mouth="neutral"),                 # point up/out
    key(arm_r=(5, 1, 3, -7), arm_l=(-4, 6, -1, 2), mouth="open"),                    # wave, hand on hip
    key(arm_r=(6, 3, 4, -6), arm_l=(-4, 6, -1, 2), mouth="neutral"),
    key(arm_r=(4, 6, 6, 2), arm_l=(-4, 6, -1, 2), mouth="open"),
    key(arm_r=(2, 7, 1, 7), arm_l=(-3, 7, -1, 6), mouth="neutral"),
]
add("04_talk_gesture", interp(talk, 8), 140, True)

# 5 ANGRY YELL — squash & stretch, both fists up, mouth open, angry marks
yell = [
    key(brow="angry", mouth="frown", squash=1, bob=1),
    key(brow="angry", mouth="open", squash=-1, bob=-2, head_dy=-1, arm_l=(-5, 4, -3, -5), arm_r=(5, 4, 3, -5), props={"angry_marks"}, arm_l_front=True),
    key(brow="angry", mouth="open", squash=-1, bob=-1, head_dy=0, arm_l=(-6, 3, -3, -5), arm_r=(6, 3, 3, -5), props={"angry_marks"}, arm_l_front=True),
    key(brow="angry", mouth="open", squash=0, bob=-2, head_dx=1, arm_l=(-5, 4, -3, -5), arm_r=(5, 4, 3, -5), props={"angry_marks"}, arm_l_front=True),
]
add("05_angry_yell", interp(yell, 6), 120, True)

# 6 SLAM DESK — raise arm, slam, bounce (desk prop included)
slam = [
    key(props={"desk", "papers_desk"}, arm_r=(5, 1, 2, -8), arm_l=(-3, 6, 0, 3), brow="angry", mouth="frown"),
    key(props={"desk", "papers_desk"}, arm_r=(6, 0, 3, -9), arm_l=(-3, 6, 0, 3), brow="angry", mouth="frown", head_dy=-1),
    key(props={"desk", "papers_desk", "shake"}, arm_r=(6, 6, 2, 6), arm_l=(-3, 6, 0, 3), brow="angry", mouth="open", bob=1, squash=2, lean=1),
    key(props={"desk", "shake", "stars"}, arm_r=(6, 6, 2, 6), arm_l=(-3, 6, 0, 3), brow="angry", mouth="open", bob=0, squash=1),
    key(props={"desk"}, arm_r=(6, 5, 2, 6), arm_l=(-3, 6, 0, 3), brow="angry", mouth="frown", bob=-1),
]
add("06_slam_desk", interp(slam, 6, loop=False), 110, False)

# 7 ARMS CROSSED — idle with arms folded
crossed = [key(arm_l=(-3, 6, 6, 1), arm_r=(3, 6, -6, 2), arm_l_front=True, arm_r_front=True, brow="angry", mouth="frown",
               bob=-R(0.5 + 0.5*math.sin(2*math.pi*i/6)), head_dx=R(0.8*math.sin(2*math.pi*i/6 + 2))) for i in range(6)]
add("07_arms_crossed", crossed, 160, True)

# 8 WALK WITH COFFEE — right arm holds mug steady, left swings
coffee = walk_frames(8, 4, 4, 3, 1)
for f in coffee:
    f["arm_r"] = (5, 3, -3, -3)
    f["props"] = {"mug"}
    f["arm_r_front"] = True
add("08_walk_coffee", coffee, 110, True)

# 9 FIRING / POINTING — dramatic point then jab
point = [
    key(arm_r=(2, 7, 1, 7), brow="angry", mouth="frown"),
    key(arm_r=(5, 4, 3, -7), brow="angry", mouth="frown", head_dy=-1),                 # wind up
    key(arm_r=(9, 1, 8, 1), brow="angry", mouth="open", lean=2, head_dx=1, props={"angry_marks"}),   # POINT
    key(arm_r=(10, 1, 9, 1), brow="angry", mouth="open", lean=3, head_dx=1, props={"angry_marks"}),  # jab
    key(arm_r=(9, 1, 8, 1), brow="angry", mouth="open", lean=2, head_dx=1),
]
add("09_point_fire", interp(point, 6, loop=False), 100, False)

# 10 HIT / REACT — knocked back, eyes closed, sweat
hit = [
    key(),
    key(lean=-3, head_dx=-2, head_dy=1, eyes="closed", mouth="open", bob=1, arm_l=(-6, 3, -3, -3), arm_r=(6, 3, 3, -3), arm_l_front=True, props={"stars"}),
    key(lean=-2, head_dx=-1, eyes="closed", mouth="frown", bob=0, arm_l=(-5, 5, -2, 1), arm_r=(5, 5, 2, 1), arm_l_front=True, props={"stars"}),
    key(lean=0, eyes="open", mouth="frown", brow="angry"),
]
add("10_hit_react", interp(hit, 4, loop=False), 100, False)

# 11 FALL / KNOCKED DOWN — tilt back, rotate to prone, land
fall = [
    key(lean=-2, eyes="closed", mouth="open", arm_l=(-6, 2, -3, -4), arm_r=(6, 2, 3, -4), arm_l_front=True),
    key(rot=25, eyes="closed", mouth="open", arm_l=(-7, 1, -4, -4), arm_r=(7, 1, 4, -4), arm_l_front=True, leg_l=(-2, 6, 0, 6), leg_r=(3, 6, 1, 6), dx=-2),
    key(rot=60, eyes="closed", mouth="open", arm_l=(-7, 1, -4, -4), arm_r=(7, 1, 4, -4), arm_l_front=True, leg_l=(-3, 6, 0, 5), leg_r=(3, 6, 1, 5), dx=-5),
    key(rot=90, eyes="x", mouth="open", arm_l=(-7, 0, -4, -4), arm_r=(7, 0, 4, -4), arm_l_front=True, leg_l=(-3, 6, 1, 4), leg_r=(3, 6, 2, 4), dx=-10, dy=-4, props={"stars"}),
    key(rot=90, eyes="x", mouth="frown", arm_l=(-7, 0, -4, -3), arm_r=(7, 0, 4, -3), arm_l_front=True, leg_l=(-3, 6, 1, 4), leg_r=(3, 6, 2, 4), dx=-10, dy=-4, props={"stars"}),
]
add("11_fall", interp(fall, 5, loop=False), 110, False)

# 12 GET UP — reverse of fall with a push-up
getup = [
    key(rot=90, eyes="closed", mouth="frown", dx=-10, dy=-4, arm_l=(-7, 0, -4, -3), arm_r=(7, 0, 4, -3), arm_l_front=True),
    key(rot=55, eyes="open", mouth="frown", brow="angry", dx=-5, dy=-1, arm_l=(-6, 5, -2, 5), arm_r=(6, 5, 2, 5), arm_l_front=True, leg_l=(-2, 6, 0, 5), leg_r=(3, 6, 1, 5)),
    key(rot=15, eyes="open", mouth="frown", brow="angry", dx=-1, squash=2, bob=2, arm_l=(-4, 6, -1, 5), arm_r=(4, 6, 1, 5), leg_l=(-1, 6, 0, 6), leg_r=(2, 6, 0, 6)),
    key(rot=0, mouth="frown", brow="angry"),
]
add("12_get_up", interp(getup, 4, loop=False), 120, False)

# 13 VICTORY / SMUG — fist pump loop + smug face
vict = [
    key(mouth="smug", arm_r=(5, 2, 3, -7), arm_l=(-4, 6, -1, 2), bob=-1),
    key(mouth="smug", arm_r=(6, 1, 3, -8), arm_l=(-4, 6, -1, 2), bob=-2, head_dy=-1),
    key(mouth="smile", arm_r=(5, 3, 3, -6), arm_l=(-4, 6, -1, 2), bob=0),
    key(mouth="smug", arm_r=(4, 5, 4, 0), arm_l=(-4, 6, -1, 2), bob=1, squash=1),
]
add("13_victory_smug", interp(vict, 6), 130, True)

# 14 INTERACT / PAPERWORK — pick up paper from desk, read
paper = [
    key(props={"desk", "papers_desk"}, arm_l=(-4, 7, 3, 6), arm_r=(3, 7, 0, 4), arm_l_front=True),
    key(props={"desk", "papers_desk"}, arm_l=(-5, 7, 2, 4), arm_r=(3, 7, 0, 4), arm_l_front=True, bob=1),      # reach
    key(props={"desk", "paper"}, arm_l=(-5, 5, 3, -3), arm_r=(3, 7, 0, 4), arm_l_front=True, bob=0, head_dx=-1, head_dy=1),  # lift + read
    key(props={"desk", "paper"}, arm_l=(-5, 4, 3, -4), arm_r=(3, 7, 0, 4), arm_l_front=True, head_dx=-2, head_dy=1, mouth="frown"),
    key(props={"desk", "paper"}, arm_l=(-5, 4, 3, -4), arm_r=(3, 7, 0, 4), arm_l_front=True, head_dx=-1, head_dy=1, mouth="frown", brow="angry"),
    key(props={"desk", "papers_desk"}, arm_l=(-4, 7, 3, 6), arm_r=(3, 7, 0, 4), arm_l_front=True, head_dy=0),
]
add("14_interact_paperwork", interp(paper, 6, loop=False), 160, False)

# 15 DIE — clutch, stagger, collapse, lie
die = [
    key(eyes="closed", mouth="open", arm_l=(-2, 6, 6, 2), arm_r=(2, 6, -6, 2), arm_l_front=True, arm_r_front=True, lean=1),
    key(eyes="closed", mouth="open", arm_l=(-2, 6, 6, 2), arm_r=(2, 6, -6, 2), arm_l_front=True, arm_r_front=True, lean=-2, head_dx=-2, bob=2, squash=2, leg_l=(-1, 6, 0, 6), leg_r=(2, 5, 0, 6)),
    key(rot=35, eyes="closed", mouth="open", arm_l=(-6, 3, -3, -2), arm_r=(6, 3, 3, -2), arm_l_front=True, dx=-3, leg_l=(-2, 6, 0, 5), leg_r=(3, 6, 1, 5)),
    key(rot=70, eyes="x", mouth="open", arm_l=(-7, 1, -4, -3), arm_r=(7, 1, 4, -3), arm_l_front=True, dx=-7, dy=-2),
    key(rot=90, eyes="x", mouth="frown", arm_l=(-7, 0, -4, -3), arm_r=(7, 0, 4, -3), arm_l_front=True, dx=-10, dy=-4),
    key(rot=90, eyes="x", mouth="frown", arm_l=(-8, 0, -4, -3), arm_r=(8, 0, 4, -3), arm_l_front=True, dx=-10, dy=-4, props={"stars"}),
]
add("15_die", interp(die, 6, loop=False), 130, False)

# ---------------- export ----------------
def export():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    master = {"canvas": [W, H], "origin_hint": "bottom-center, feet at y=45", "animations": {}}
    all_sheets = []
    for name, a in ANIMS.items():
        folder = os.path.join(OUT, name)
        os.makedirs(folder)
        imgs = [draw_character(f) for f in a["frames"]]
        n = len(imgs)
        # individual frames
        for i, im in enumerate(imgs):
            im.save(os.path.join(folder, f"{name}_{i:02d}.png"))
        # horizontal strip sheet
        sheet = Image.new("RGBA", (W * n, H), TRANSPARENT)
        for i, im in enumerate(imgs):
            sheet.paste(im, (i * W, 0))
        sheet.save(os.path.join(folder, f"{name}_sheet.png"))
        all_sheets.append((name, sheet))
        # preview gif (4x nearest)
        big = [im.resize((W * SCALE_PREVIEW, H * SCALE_PREVIEW), Image.NEAREST).convert("P", palette=Image.ADAPTIVE) for im in imgs]
        big[0].save(os.path.join(folder, f"{name}_preview.gif"), save_all=True, append_images=big[1:],
                    duration=a["ms"], loop=0 if a["loop"] else 1, disposal=2, transparency=0)
        # Aseprite-style JSON (hash format) — importable by most engines/tools
        data = {
            "frames": {f"{name} {i}.ase": {
                "frame": {"x": i * W, "y": 0, "w": W, "h": H},
                "rotated": False, "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": W, "h": H},
                "sourceSize": {"w": W, "h": H}, "duration": a["ms"]} for i in range(n)},
            "meta": {"app": "generated", "image": f"{name}_sheet.png", "format": "RGBA8888",
                     "size": {"w": W * n, "h": H}, "scale": "1",
                     "frameTags": [{"name": name, "from": 0, "to": n - 1,
                                    "direction": "forward", "repeat": "0" if a["loop"] else "1"}]},
        }
        with open(os.path.join(folder, f"{name}.json"), "w") as fh:
            json.dump(data, fh, indent=1)
        master["animations"][name] = {"frames": n, "frame_ms": a["ms"], "loop": a["loop"],
                                      "sheet": f"{name}/{name}_sheet.png", "fps": round(1000 / a["ms"], 1)}

    # master sheet: one row per animation
    maxn = max(len(a["frames"]) for a in ANIMS.values())
    ms = Image.new("RGBA", (W * maxn, H * len(all_sheets)), TRANSPARENT)
    for r, (name, sh) in enumerate(all_sheets):
        ms.paste(sh, (0, r * H))
    ms.save(os.path.join(OUT, "ALL_animations_sheet.png"))
    ms.resize((ms.width * 3, ms.height * 3), Image.NEAREST).save(os.path.join(OUT, "ALL_animations_sheet_3x_preview.png"))
    with open(os.path.join(OUT, "animations.json"), "w") as fh:
        json.dump(master, fh, indent=1)

    # GIMP/Aseprite palette
    with open(os.path.join(OUT, "bad_office_manager.gpl"), "w") as fh:
        fh.write("GIMP Palette\nName: Bad Office Manager\nColumns: 8\n#\n")
        for k, (r, g, b) in P.items():
            fh.write(f"{r:3d} {g:3d} {b:3d} {k}\n")

    # Godot 4 SpriteFrames resource
    write_godot(master)
    return master

def write_godot(master):
    lines = ['[gd_resource type="SpriteFrames" load_steps=%d format=3]\n' % (
        2 + len(master["animations"]) + sum(a["frames"] for a in master["animations"].values()))]
    ext_id = 1
    sub = []
    anims = []
    for name, a in master["animations"].items():
        lines.append(f'[ext_resource type="Texture2D" path="res://sprites/bad_office_manager/{a["sheet"]}" id="{ext_id}"]')
        frames = []
        for i in range(a["frames"]):
            sid = f"{name}_{i}"
            sub.append(f'[sub_resource type="AtlasTexture" id="{sid}"]\natlas = ExtResource("{ext_id}")\nregion = Rect2({i*W}, 0, {W}, {H})\n')
            frames.append(f'{{"duration": 1.0, "texture": SubResource("{sid}")}}')
        anims.append(f'{{"frames": [{", ".join(frames)}], "loop": {"true" if a["loop"] else "false"}, "name": &"{name}", "speed": {a["fps"]}}}')
        ext_id += 1
    lines.append("")
    lines.extend(sub)
    lines.append("[resource]\nanimations = [" + ", ".join(anims) + "]\n")
    os.makedirs(os.path.join(OUT, "godot"), exist_ok=True)
    with open(os.path.join(OUT, "godot", "BadOfficeManager.tres"), "w") as fh:
        fh.write("\n".join(lines))

if __name__ == "__main__":
    m = export()
    for k, v in m["animations"].items():
        print(f"{k:24s} {v['frames']} frames @ {v['frame_ms']}ms loop={v['loop']}")
