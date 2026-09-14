"""Low-level mesh helpers: primitives placed in world space, joining, voxel
remeshing and clean-up. Everything is in metres, Z up, the character faces -Y
and his left side is +X."""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def new_mesh_obj(name, verts=(), faces=(), edges=()):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [tuple(e) for e in edges], [tuple(f) for f in faces])
    me.update()
    return _link(bpy.data.objects.new(name, me))


def _bm_to_obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return _link(bpy.data.objects.new(name, me))


def _xform(bm, center, rot=(0, 0, 0), scale=(1, 1, 1)):
    m = Matrix.Translation(Vector(center)) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal(
        (*scale, 1.0)
    )
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def ellipsoid(name, center, radii, rot=(0, 0, 0), seg=32, rings=16):
    """UV sphere scaled to radii (rx, ry, rz), then rotated by Euler rot."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    _xform(bm, center, rot, radii)
    return _bm_to_obj(bm, name)


def sphere(name, center, r, seg=24, rings=12):
    return ellipsoid(name, center, (r, r, r), seg=seg, rings=rings)


def _dir_rot(p0, p1):
    """Rotation that maps +Z to the direction p0->p1."""
    d = (Vector(p1) - Vector(p0)).normalized()
    return Vector((0, 0, 1)).rotation_difference(d).to_euler("XYZ")


def capsule(name, p0, p1, r0, r1=None, cap0=True, cap1=True, seg=24):
    """Tapered cylinder from p0 (radius r0) to p1 (radius r1) with optional
    hemispherical caps. Overlapping shells are fine - everything is voxel
    remeshed afterwards."""
    r1 = r0 if r1 is None else r1
    p0, p1 = Vector(p0), Vector(p1)
    length = (p1 - p0).length
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=length
    )
    rot = _dir_rot(p0, p1)
    _xform(bm, (p0 + p1) * 0.5, rot, (1, 1, 1))
    if cap0:
        res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=12, radius=r0)
        bmesh.ops.translate(bm, vec=p0, verts=res["verts"])
    if cap1:
        res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=12, radius=r1)
        bmesh.ops.translate(bm, vec=p1, verts=res["verts"])
    return _bm_to_obj(bm, name)


def rbox(name, center, size, rot=(0, 0, 0), bevel=0.0, segments=3):
    """Box of full size (sx, sy, sz), optionally bevelled."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    _xform(bm, center, rot, size)
    obj = _bm_to_obj(bm, name)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "NONE"
        apply_modifiers(obj)
    return obj


def torus(name, center, major, minor, rot=(0, 0, 0), scale=(1, 1, 1), seg_major=32, seg_minor=12):
    bm = bmesh.new()
    verts = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        ca, sa = math.cos(a), math.sin(a)
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor
            r = major + minor * math.cos(b)
            verts.append(bm.verts.new((r * ca, r * sa, minor * math.sin(b))))
    for i in range(seg_major):
        for j in range(seg_minor):
            a0 = verts[i * seg_minor + j]
            a1 = verts[i * seg_minor + (j + 1) % seg_minor]
            b0 = verts[((i + 1) % seg_major) * seg_minor + j]
            b1 = verts[((i + 1) % seg_major) * seg_minor + (j + 1) % seg_minor]
            bm.faces.new((a0, b0, b1, a1))
    _xform(bm, center, rot, scale)
    return _bm_to_obj(bm, name)


def cylinder(name, p0, p1, r0, r1=None, seg=32):
    return capsule(name, p0, p1, r0, r1, cap0=False, cap1=False, seg=seg)


def mirror_x(obj, name=None):
    """Duplicate obj mirrored across the YZ plane (his other side)."""
    me = obj.data.copy()
    dup = _link(bpy.data.objects.new(name or obj.name.replace("_L", "_R"), me))
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.scale(bm, vec=(-1, 1, 1), verts=bm.verts)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return dup


def join(objs, name):
    """Join objects into one mesh object (world transforms are identity)."""
    objs = [o for o in objs if o is not None]
    bm = bmesh.new()
    for o in objs:
        bm.from_mesh(o.data)
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(me)
    return _bm_to_obj(bm, name)


def apply_modifiers(obj):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)


def shade_smooth(obj, angle_deg=None):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        if angle_deg is None:
            bpy.ops.object.shade_smooth()
        else:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))


def remesh(obj, voxel, smooth_iter=6, smooth_factor=0.5, target_faces=None):
    """Union all the overlapping primitives in obj into a single smooth skin.
    Voxel remesh, relax, then reduce to a game budget."""
    mod = obj.modifiers.new("remesh", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel
    mod.adaptivity = 0.0
    mod.use_smooth_shade = True
    apply_modifiers(obj)
    if smooth_iter:
        sm = obj.modifiers.new("smooth", "SMOOTH")
        sm.factor = smooth_factor
        sm.iterations = smooth_iter
        apply_modifiers(obj)
    if target_faces:
        decimate(obj, target_faces)
    shade_smooth(obj)
    return obj


def smart_unwrap(obj, angle_deg=80.0, margin=0.0):
    """Smart UV project the object (edit-mode operator, works headless)."""
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle_deg), island_margin=margin, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def decimate(obj, target_faces, quads=True):
    """Bring a dense remesh down to a game budget. QuadriFlow rebuilds it as
    evenly sized quads (clean deformation, no sliver triangles); if that
    fails on a part, fall back to collapse decimation. Unwrapped afterwards
    (quads) or before (collapse), so the UVs never come from slivers."""
    if quads and len(obj.data.polygons) > target_faces:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
                bpy.ops.object.quadriflow_remesh(target_faces=target_faces, use_mesh_symmetry=False,
                                                 use_preserve_sharp=False, use_preserve_boundary=False,
                                                 smooth_normals=True, seed=1)
            if obj.data.uv_layers:
                obj.data.uv_layers.remove(obj.data.uv_layers[0])
            smart_unwrap(obj)
            return obj
        except RuntimeError as e:
            print("quadriflow failed on %s (%s), decimating instead" % (obj.name, e))
    if not obj.data.uv_layers:
        smart_unwrap(obj)
    if len(obj.data.polygons) > target_faces:
        dec = obj.modifiers.new("decimate", "DECIMATE")
        dec.decimate_type = "COLLAPSE"
        dec.ratio = target_faces / len(obj.data.polygons)
        dec.use_collapse_triangulate = True
        apply_modifiers(obj)
    return obj


def bisect_keep(obj, point, normal, fill=False):
    """Cut obj with a plane and keep the side the normal points to."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(
        bm, geom=geom, plane_co=Vector(point), plane_no=Vector(normal).normalized(),
        clear_outer=False, clear_inner=True, use_snap_center=False,
    )
    if fill:
        # only cap the cut itself, never the shell's other open edges
        edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_valid and e.is_boundary]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def solidify(obj, thickness, offset=1.0, even=True):
    mod = obj.modifiers.new("solidify", "SOLIDIFY")
    mod.thickness = thickness
    mod.offset = offset
    mod.use_even_offset = even
    apply_modifiers(obj)
    return obj


def shrinkwrap(obj, target, offset, mode="NEAREST_SURFACEPOINT", project_axis=None):
    mod = obj.modifiers.new("shrinkwrap", "SHRINKWRAP")
    mod.target = target
    mod.offset = offset
    mod.wrap_mode = "ABOVE_SURFACE"
    if project_axis:
        mod.wrap_method = "PROJECT"
        mod.use_negative_direction = True
        mod.use_positive_direction = True
        setattr(mod, "use_project_%s" % project_axis, True)
    else:
        mod.wrap_method = mode
    apply_modifiers(obj)
    return obj


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def bvh_of(obj):
    from mathutils.bvhtree import BVHTree

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    return bvh


def ribbon(name, points, width, target_bvh=None, lift=0.0):
    """A flat strip following `points`, laid on the surface described by
    target_bvh (nearest surface point + normal), lifted off it by `lift`."""
    pts, nrms = [], []
    for p in points:
        p = Vector(p)
        if target_bvh is not None:
            loc, nrm, _, _ = target_bvh.find_nearest(p)
            if loc is not None:
                p = loc + nrm * lift
                nrms.append(nrm)
            else:
                nrms.append(Vector((0, -1, 0)))
        else:
            nrms.append(Vector((0, -1, 0)))
        pts.append(p)
    # the target is a faceted mesh: average the sampled positions and normals
    # along the path so the strip does not wobble from face to face
    for _ in range(4):
        pts = [pts[i] if i in (0, len(pts) - 1) else (pts[i - 1] + pts[i] * 2 + pts[i + 1]) * 0.25 for i in range(len(pts))]
        nrms = [nrms[i] if i in (0, len(nrms) - 1) else (nrms[i - 1] + nrms[i] * 2 + nrms[i + 1]).normalized() for i in range(len(nrms))]
    verts, faces = [], []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        side = t.cross(nrms[i]).normalized() * (width * 0.5)
        verts += [p - side, p + side]
        if i:
            k = 2 * i
            faces.append((k - 2, k - 1, k + 1, k))
    return new_mesh_obj(name, verts, faces)


def catmull_rom(points, samples_per_seg=8, closed=False):
    """Smooth polyline through the control points."""
    P = [Vector(p) for p in points]
    if closed:
        P = [P[-1]] + P + [P[0], P[1]]
    else:
        P = [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(samples_per_seg):
            t = s / samples_per_seg
            t2, t3 = t * t, t * t * t
            out.append(
                0.5
                * (
                    (2 * p1)
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
            )
    out.append(P[-2])
    return out


def scale_about(obj, pivot, s):
    """Scale obj's mesh data uniformly about a world point."""
    m = Matrix.Translation(Vector(pivot)) @ Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(pivot))
    obj.data.transform(m)
    obj.data.update()
    return obj
