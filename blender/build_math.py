"""
Vektorgeometrie — Bausteine und Szenen-Modelle aus Blender.

Koordinaten: 1 Blender-Einheit = 1 LE. Mathematische Koordinaten (x1|x2|x3) wie im NRW-Schulbuch:
x1 zeigt zum Betrachter, x2 nach rechts, x3 nach oben. Blender (Z oben) → glTF (Y oben) wandelt (x, y, z) in (x, z, −y),
deshalb liegt ein Punkt (x1|x2|x3) in Blender bei (x2, −x1, x3) — siehe M().
Im offenen Blender ausführen: exec(open(PFAD).read())
Schreibt: blender/math.blend, web/models/math.glb
"""
import bpy, bmesh, math, json, os, time, random
import numpy as np
from mathutils import Vector, Matrix, noise

ROOT = "/Users/sim/Documents/lmgMINIprojekte/BLENDERmath"
GLB_PATH = os.path.join(ROOT, "web/models/math.glb")
BLEND_PATH = os.path.join(ROOT, "blender/math.blend")
t0 = time.time()
rng = random.Random(4)


def M(x1, x2, x3):
    return Vector((x2, -x1, x3))


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def make_mat(name, hexcol, rough=0.5, metal=0.0, emit=None, alpha=1.0, trans=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb(hexcol), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*srgb(emit[0]), 1)
        b.inputs["Emission Strength"].default_value = emit[1]
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
    if trans:
        b.inputs["Transmission Weight"].default_value = trans
    m.diffuse_color = (*srgb(hexcol), alpha)
    return m


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.actions, bpy.data.cameras, bpy.data.lights, bpy.data.images):
    for d in list(coll):
        try:
            coll.remove(d)
        except Exception:
            pass
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 0, 1
if scene.world is None:
    scene.world = bpy.data.worlds.new("World")
try:
    scene.world.use_nodes = True
except Exception:
    pass
_bg = scene.world.node_tree.nodes.get("Background")
if _bg:
    _bg.inputs["Color"].default_value = (0.002, 0.004, 0.01, 1)
LINK = scene.collection


def new_obj(name, me, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, me)
    LINK.objects.link(o)
    if parent:
        o.parent = parent
    o.location = loc
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    LINK.objects.link(o)
    if parent:
        o.parent = parent
    o.location = loc
    return o


def to_mesh(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    if mat:
        me.materials.append(mat)
    return me


MAT = {
    "weiss": make_mat("Baustein", "#ffffff", 0.35),
    "glas": make_mat("Glas", "#bfe3ff", 0.05, alpha=0.28, trans=0.9),
    "rahmen": make_mat("Rahmen_Stahl", "#c9ced6", 0.3, metal=0.9),
    "platz": make_mat("Platz_Stein", "#b9b3a8", 0.75),
    "wasser": make_mat("Becken_Wasser", "#2d6fa6", 0.08),
    "rumpf_a": make_mat("Rumpf_A", "#f4f6f8", 0.35, metal=0.2),
    "rumpf_b": make_mat("Rumpf_B", "#f4f6f8", 0.35, metal=0.2),
    "akzent_a": make_mat("Akzent_A", "#ff7a59", 0.4),
    "akzent_b": make_mat("Akzent_B", "#4db3ff", 0.4),
    "fenster": make_mat("Fenster", "#1d2633", 0.2),
    "triebwerk": make_mat("Triebwerk", "#8a929c", 0.35, metal=0.7),
    "mast_rot": make_mat("Mast_Rot", "#d6403a", 0.5),
    "mast_weiss": make_mat("Mast_Weiss", "#f1f1ee", 0.5),
    "wiese": make_mat("Wiese", "#5d7d3c", 0.9),
    "fels": make_mat("Hang_Fels", "#7e7a6c", 0.9),
    "sonne": make_mat("Sonne_Glow", "#ffd27a", 0.5, emit=("#ffcf6a", 6.0)),
}

# ================================================================= building blocks (templates, cloned in the browser)
lib = empty("Bausteine", (0, 0, -100))      # parked out of sight; the web app clones them
# unit shaft along +Z (Blender) = +Y (three): radius 1, height 1, base at 0
bm = bmesh.new()
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=1.0, radius2=1.0, depth=1.0)
bmesh.ops.translate(bm, verts=r["verts"], vec=(0, 0, 0.5))
new_obj("Tpl_Schaft", to_mesh("Tpl_Schaft", bm, MAT["weiss"]), lib)
# arrow head: cone of height 1, radius 1, base at 0
bm = bmesh.new()
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=1.0, radius2=0.0, depth=1.0)
bmesh.ops.translate(bm, verts=r["verts"], vec=(0, 0, 0.5))
new_obj("Tpl_Spitze", to_mesh("Tpl_Spitze", bm, MAT["weiss"]), lib)
# point: smooth sphere radius 1
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
new_obj("Tpl_Punkt", to_mesh("Tpl_Punkt", bm, MAT["weiss"]), lib)
# tick: flat disc radius 1, thickness 0.2 (oriented later)
bm = bmesh.new()
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=1.0, radius2=1.0, depth=0.2)
new_obj("Tpl_Strich", to_mesh("Tpl_Strich", bm, MAT["weiss"], smooth=False), lib)
# angle arc / torus segment for right angles: a small cube
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
new_obj("Tpl_Wuerfel", to_mesh("Tpl_Wuerfel", bm, MAT["weiss"], smooth=False), lib)

# ================================================================= scene 1: glass pyramid (Louvre style) on a plaza
PY = empty("Szene_Pyramide")
A, Bq, Cq, D, S = M(3, -3, 0), M(3, 3, 0), M(-3, 3, 0), M(-3, -3, 0), M(0, 0, 4.5)


def beam(name, a, b, rad, mat, parent, segs=8):
    d = b - a
    bm = bmesh.new()
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=rad, radius2=rad, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=q.to_matrix())
    bmesh.ops.translate(bm, verts=r["verts"], vec=(a + b) / 2)
    return new_obj(name, to_mesh(name, bm, mat), parent)


# glass faces
bm = bmesh.new()
vs = [bm.verts.new(p) for p in (A, Bq, Cq, D, S)]
for f in ((0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)):
    bm.faces.new([vs[i] for i in f])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
new_obj("Pyramide_Glas", to_mesh("Pyramide_Glas", bm, MAT["glas"], smooth=False), PY)
# edges and a lattice of mullions on every face
for i, (p, q) in enumerate(((A, Bq), (Bq, Cq), (Cq, D), (D, A), (A, S), (Bq, S), (Cq, S), (D, S))):
    beam(f"Pyramide_Kante_{i}", p, q, 0.05, MAT["rahmen"], PY)
k = 0
for (p0, p1) in ((A, Bq), (Bq, Cq), (Cq, D), (D, A)):
    for j in range(1, 6):
        u = j / 6
        a = p0.lerp(p1, u)
        # mullions from the base edge towards the apex
        beam(f"Pyramide_Sprosse_{k}", a, a.lerp(S, 0.999), 0.018, MAT["rahmen"], PY, segs=6)
        k += 1
    for j in range(1, 5):   # horizontal ribs
        h = j / 5
        beam(f"Pyramide_Riegel_{k}", p0.lerp(S, h), p1.lerp(S, h), 0.016, MAT["rahmen"], PY, segs=6)
        k += 1
# plaza with a reflecting pool ring
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
bmesh.ops.scale(bm, vec=(10.0, 10.0, 0.12), verts=bm.verts)
bmesh.ops.translate(bm, vec=(0, 0, -0.065), verts=bm.verts)
new_obj("Pyramide_Platz", to_mesh("Pyramide_Platz", bm, MAT["platz"], smooth=False), PY)
for i, (cx, cy, w, h) in enumerate(((0, 4.4, 7.5, 0.9), (0, -4.4, 7.5, 0.9))):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, h, 0.02), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(cx, cy, 0.005), verts=bm.verts)
    new_obj(f"Pyramide_Becken_{i}", to_mesh(f"Pyramide_Becken_{i}", bm, MAT["wasser"], smooth=False), PY)

# ================================================================= scene 2: two airliners (flight paths, km)
def airliner(name, rumpf, akzent):
    """Nose along +Y (Blender) = −x1 … the web app orients it along the flight direction anyway."""
    root = empty(name)
    L, R = 1.6, 0.11
    bm = bmesh.new()
    prof = [(-0.5, 0.02), (-0.47, 0.06), (-0.42, 0.09), (-0.34, 0.11), (0.3, 0.11), (0.42, 0.08), (0.5, 0.03)]
    rings = []
    for x, rr in prof:
        ring = []
        for k in range(16):
            a = 2 * math.pi * k / 16
            ring.append(bm.verts.new((rr * math.cos(a), x * L, rr * math.sin(a) * 1.05 + (0.04 if x > 0.42 else 0))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(16):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % 16], rings[i + 1][(k + 1) % 16], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    new_obj(name + "_Rumpf", to_mesh(name + "_Rumpf", bm, rumpf), root)

    def slab(nm, pts, z, th, mat):
        bm = bmesh.new()
        top = [bm.verts.new((x, y, z + th / 2)) for x, y in pts]
        bot = [bm.verts.new((x, y, z - th / 2)) for x, y in pts]
        bm.faces.new(top)
        bm.faces.new(bot[::-1])
        for i in range(len(pts)):
            j = (i + 1) % len(pts)
            bm.faces.new((top[i], bot[i], bot[j], top[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        return new_obj(nm, to_mesh(nm, bm, mat, smooth=False), root)
    for s in (-1, 1):
        slab(f"{name}_Fluegel_{'L' if s < 0 else 'R'}", [(s * 0.1, 0.12), (s * 0.95, -0.22), (s * 0.95, -0.32), (s * 0.1, -0.2)][:: (1 if s > 0 else -1)], -0.03, 0.03, rumpf)
        slab(f"{name}_Hoehenleitwerk_{'L' if s < 0 else 'R'}", [(s * 0.05, -0.62), (s * 0.36, -0.76), (s * 0.36, -0.8), (s * 0.05, -0.72)][:: (1 if s > 0 else -1)], 0.04, 0.02, akzent)
        # engine
        bm = bmesh.new()
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.055, radius2=0.045, depth=0.28)
        bmesh.ops.rotate(bm, verts=r["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
        bmesh.ops.translate(bm, verts=r["verts"], vec=(s * 0.38, -0.02, -0.09))
        new_obj(f"{name}_Triebwerk_{'L' if s < 0 else 'R'}", to_mesh(f"{name}_Triebwerk", bm, MAT["triebwerk"]), root)
    bm = bmesh.new()
    pts = [(-0.58, 0.0), (-0.8, 0.0), (-0.8, 0.36), (-0.7, 0.36)]
    top = [bm.verts.new((0.012, y, z)) for y, z in pts]
    bot = [bm.verts.new((-0.012, y, z)) for y, z in pts]
    bm.faces.new(top)
    bm.faces.new(bot[::-1])
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    new_obj(name + "_Seitenleitwerk", to_mesh(name + "_Seitenleitwerk", bm, akzent, smooth=False), root)
    # cockpit windows
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(0.12, 0.05, 0.03), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0.655, 0.07), verts=bm.verts)
    new_obj(name + "_Cockpit", to_mesh(name + "_Cockpit", bm, MAT["fenster"], smooth=False), root)
    # stripe along the fuselage
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(0.225, 1.0, 0.025), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, -0.05, 0.0), verts=bm.verts)
    new_obj(name + "_Streifen", to_mesh(name + "_Streifen", bm, akzent, smooth=False), root)
    return root


airliner("Flugzeug_A", MAT["rumpf_a"], MAT["akzent_a"]).location = (0, 0, -100)
airliner("Flugzeug_B", MAT["rumpf_b"], MAT["akzent_b"]).location = (0, 0, -100)

# ================================================================= scene 3: radio mast on flat ground at the foot of a slope, sun
# Boden x3 = 0 für x1 ≥ −1, Hang E: x1 + x3 = −1 für x1 ≤ −1. Mast in F(3|2|0), 6 LE hoch.
SC = empty("Szene_Schatten")
bm = bmesh.new()
nx, ny = 28, 40
ground = []
for i in range(nx + 1):
    x1 = -1 + 7.5 * i / nx
    for j in range(ny + 1):
        x2 = -6 + 12 * j / ny
        ground.append(bm.verts.new(M(x1, x2, -0.01 + 0.02 * noise.noise(Vector((x1, x2, 0.3))))))
for i in range(nx):
    for j in range(ny):
        a = i * (ny + 1) + j
        bm.faces.new((ground[a], ground[a + ny + 1], ground[a + ny + 2], ground[a + 1]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
for f in bm.faces:
    if f.normal.z < 0:
        f.normal_flip()
new_obj("Schatten_Boden", to_mesh("Schatten_Boden", bm, MAT["wiese"]), SC)
bm = bmesh.new()
hang = []
nh = 20
for i in range(nh + 1):
    x1 = -1 - 5.5 * i / nh
    for j in range(ny + 1):
        x2 = -6 + 12 * j / ny
        x3 = -1 - x1
        hang.append(bm.verts.new(M(x1, x2, x3 + 0.04 * noise.noise(Vector((x1 * 0.7, x2 * 0.7, 2.0))))))
for i in range(nh):
    for j in range(ny):
        a = i * (ny + 1) + j
        bm.faces.new((hang[a], hang[a + ny + 1], hang[a + ny + 2], hang[a + 1]))
for f in bm.faces:
    if f.normal.z < 0:
        f.normal_flip()
new_obj("Schatten_Hang", to_mesh("Schatten_Hang", bm, MAT["fels"]), SC)
# a few rocks on the slope
for k in range(8):
    x1 = -1.6 - rng.random() * 4.2
    x2 = -5 + rng.random() * 10
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.18 + rng.random() * 0.2)
    for v in bm.verts:
        v.co *= 1 + 0.25 * noise.noise(v.co * 4 + Vector((k, 0, 0)))
    bmesh.ops.translate(bm, verts=bm.verts, vec=M(x1, x2, -1 - x1))
    new_obj(f"Schatten_Fels_{k}", to_mesh(f"Schatten_Fels_{k}", bm, MAT["fels"], smooth=False), SC)
# lattice radio mast with red/white bands, foot F(3|2|0), height 6
F = M(3, 2, 0)
H = 6.0
mast = empty("Schatten_Mast", F, SC)
nb = 8
for i in range(nb):
    z0, z1 = H * i / nb, H * (i + 1) / nb
    w0, w1 = 0.32 - 0.22 * i / nb, 0.32 - 0.22 * (i + 1) / nb
    mat = MAT["mast_rot"] if i % 2 == 0 else MAT["mast_weiss"]
    corners0 = [Vector((sx * w0, sy * w0, z0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    corners1 = [Vector((sx * w1, sy * w1, z1)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for c in range(4):
        beam(f"Mast_Holm_{i}_{c}", corners0[c], corners1[c], 0.028, mat, mast, segs=6)
        n = (c + 1) % 4
        beam(f"Mast_Strebe_{i}_{c}", corners0[c], corners1[n], 0.014, mat, mast, segs=5)
        beam(f"Mast_Ring_{i}_{c}", corners1[c], corners1[n], 0.012, mat, mast, segs=5)
beam("Mast_Antenne", Vector((0, 0, H)), Vector((0, 0, H + 0.25)), 0.02, MAT["mast_weiss"], mast)
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.07)
bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, H))
new_obj("Mast_Licht_Glow", to_mesh("Mast_Licht_Glow", bm, make_mat("Mast_Licht_Glow", "#ff3b2f", 0.4, emit=("#ff3b2f", 8.0))), mast)
# sun far away against the light direction v = (−1|−1|−1)
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.1)
sun_pos = M(3, 2, 6) - (Vector(M(-1, -1, -1)).normalized() * 16)
bmesh.ops.translate(bm, verts=bm.verts, vec=sun_pos)
new_obj("Sonne_Glow", to_mesh("Sonne_Glow", bm, MAT["sonne"]), SC)

# ---------------------------------------------------------------- export
result = {"objects": len(bpy.data.objects)}
if os.environ.get("MATH_NO_EXPORT") is None:
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format="GLB", use_selection=False, export_animations=False,
                              export_cameras=False, export_lights=False, export_apply=True, export_yup=True,
                              export_texcoords=False, export_normals=True, export_materials="EXPORT",
                              export_meshopt_compression_enable=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, compress=True)
    result["glb_mb"] = round(os.path.getsize(GLB_PATH) / 1e6, 2)
result["build_s"] = round(time.time() - t0, 1)
print(json.dumps(result))
