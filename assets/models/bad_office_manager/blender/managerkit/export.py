"""glTF export and a few sanity checks on what was written."""

import json
import os
import struct

import bpy


def export_glb(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_skins=True,
        export_def_bones=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips_merged_animation_name="",
        export_frame_range=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_rest_position_armature=True,
        export_extras=True,
    )
    return path


def describe_glb(path):
    """Parse the JSON chunk and report what a loader will find."""
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a glb"
    clen, ctype = struct.unpack_from("<II", data, 12)
    js = json.loads(data[20:20 + clen])
    meshes = js.get("meshes", [])
    tris = 0
    for m in meshes:
        for p in m["primitives"]:
            acc = js["accessors"][p["indices"]]
            tris += acc["count"] // 3
    anims = [(a["name"], max(js["accessors"][s["input"]]["max"][0] for s in a["samplers"])) for a in js.get("animations", [])]
    skins = js.get("skins", [])
    info = {
        "bytes": len(data),
        "meshes": [m["name"] for m in meshes],
        "triangles": tris,
        "materials": [m["name"] for m in js.get("materials", [])],
        "images": [(i.get("name"), i.get("mimeType")) for i in js.get("images", [])],
        "joints": len(skins[0]["joints"]) if skins else 0,
        "animations": anims,
    }
    return info
