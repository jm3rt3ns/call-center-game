"""Join the skinned parts into one mesh, unwrap it and bake the procedural
materials down to a base-colour + roughness atlas: one draw call in-game."""

import math

import bpy


def join_for_export(parts, arm, name="Manager", keep_separate=("Lenses", "Mug")):
    from . import geom as G

    objs = [o for n, o in parts.items() if n not in keep_separate]
    flat = ("Tie", "Suspenders", "Pocket", "Collar", "Belt", "Knot")
    for o in objs:
        if not o.data.uv_layers:
            G.smart_unwrap(o, angle_deg=89.0 if o.name in flat else 66.0)
    main = parts["Skin"]
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = main
    with bpy.context.temp_override(active_object=main, selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    main.name = name
    main.data.name = name
    # exactly one armature modifier survives the join
    seen = False
    for mod in list(main.modifiers):
        if mod.type == "ARMATURE":
            if seen:
                main.modifiers.remove(mod)
            seen = True
    return main


def unwrap(obj, margin=0.006):
    """Pack the per-part islands into one atlas layout."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, shape_method="AABB")
    bpy.ops.object.mode_set(mode="OBJECT")


def pad_atlas(path, passes=48):
    """Grow every island's colour outward into the unbaked (transparent)
    pixels so texture filtering at a seam never pulls in the background."""
    import numpy as np
    from PIL import Image

    im = np.array(Image.open(path).convert("RGBA")).astype(np.float32)
    rgb, a = im[..., :3], im[..., 3] > 0
    for _ in range(passes):
        if a.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(a.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sa = np.roll(a, (dy, dx), (0, 1))
            sr = np.roll(rgb, (dy, dx), (0, 1))
            acc += sr * sa[..., None]
            cnt += sa
        fill = (~a) & (cnt > 0)
        rgb[fill] = acc[fill] / cnt[fill][:, None]
        a = a | fill
    out = np.dstack([rgb, np.full(a.shape, 255, np.float32)]).clip(0, 255).astype(np.uint8)
    Image.fromarray(out[..., :3], "RGB").save(path)


def bake_atlas(scene, obj, size, out_dir, samples=4):
    """Bake DIFFUSE colour and ROUGHNESS of every material slot into two
    images and then swap the mesh onto one material that reads them."""
    import os

    images = {}
    for kind, colorspace in (("color", "sRGB"), ("rough", "Non-Color")):
        img = bpy.data.images.new("manager_%s" % kind, size, size, alpha=True)
        img.colorspace_settings.name = colorspace
        images[kind] = img
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.bake.margin = 28
    scene.render.bake.use_selected_to_active = False
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for kind, bake_type in (("color", "DIFFUSE"), ("rough", "ROUGHNESS")):
        for slot in obj.material_slots:
            nt = slot.material.node_tree
            node = nt.nodes.get("bake_target") or nt.nodes.new("ShaderNodeTexImage")
            node.name = "bake_target"
            node.image = images[kind]
            nt.nodes.active = node
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
        with bpy.context.temp_override(active_object=obj, selected_objects=[obj]):
            bpy.ops.object.bake(type=bake_type)
        path = os.path.join(out_dir, "manager_%s.png" % kind)
        images[kind].filepath_raw = path
        images[kind].file_format = "PNG"
        images[kind].save()
        pad_atlas(path)
        images[kind].reload()
        images[kind].alpha_mode = "NONE"
    # one game material
    mat = bpy.data.materials.new("manager_atlas")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Specular IOR Level"].default_value = 0.4
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    col = nt.nodes.new("ShaderNodeTexImage")
    col.image = images["color"]
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    rgh = nt.nodes.new("ShaderNodeTexImage")
    rgh.image = images["rough"]
    nt.links.new(rgh.outputs["Color"], bsdf.inputs["Roughness"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.material_index = 0
    return mat, images
