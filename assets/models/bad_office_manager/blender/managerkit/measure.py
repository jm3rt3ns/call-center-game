"""One place for the manager's proportions. The modelling, the rig and the
animations all read these so they cannot drift apart. Metres, Z up, he faces
-Y, his left is +X. Height 1.85 m (docs/3d-game-spec.md SS4.3)."""

HEIGHT = 1.85

# vertical landmarks
Z_ANKLE = 0.09
Z_KNEE = 0.53
Z_HIP = 0.96        # hip joint
Z_CROTCH = 0.86
Z_BELT = 1.07
Z_WAIST = 1.12
Z_CHEST = 1.32      # sternum / pec centre
Z_SHOULDER = 1.53   # shoulder joint
Z_NECK = 1.575      # neck base / collar
Z_CHIN = 1.60
Z_HEAD = 1.735      # head centre
Z_TOP = HEIGHT

# lateral landmarks (half widths, his left side is +X)
X_HIP = 0.115
X_KNEE = 0.125
X_ANKLE = 0.125
X_SHOULDER = 0.245  # shoulder joint
X_ELBOW = 0.315
X_WRIST = 0.335

# joints of the rest (A-) pose, used by both the mesh and the armature
J = {
    "hip_L": (X_HIP, 0.0, Z_HIP),
    "knee_L": (X_KNEE, -0.01, Z_KNEE),
    "ankle_L": (X_ANKLE, 0.0, Z_ANKLE),
    "toe_L": (X_ANKLE, -0.15, 0.02),
    "shoulder_L": (X_SHOULDER, -0.01, Z_SHOULDER),
    "elbow_L": (X_ELBOW, -0.02, 1.245),
    "wrist_L": (X_WRIST, -0.05, 1.00),
    "fist_L": (X_WRIST + 0.005, -0.06, 0.935),
}
for k in list(J):
    if k.endswith("_L"):
        x, y, z = J[k]
        J[k[:-2] + "_R"] = (-x, y, z)
J.update(
    {
        "root": (0.0, 0.0, 0.0),
        "hips": (0.0, 0.01, Z_HIP + 0.02),
        "spine": (0.0, 0.01, Z_WAIST),
        "chest": (0.0, 0.0, 1.24),
        "neck": (0.0, 0.01, Z_NECK),
        "head": (0.0, 0.0, Z_CHIN + 0.02),
        "head_top": (0.0, 0.0, Z_TOP),
    }
)

# The concept sheet's head is big and sits almost on the collar: every head
# part is scaled by this about the crown after it is modelled at 1:1.
HEAD_SCALE = 1.10
HEAD_PIVOT = (0.0, 0.0, Z_TOP)
