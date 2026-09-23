#!/usr/bin/env python3
"""
build_parts.py — offline compiler that turns short_run_parts/*.svg (and the
three JSON specs) into ES3-literal .jsx data files that character_gen.jsx can
$.evalFile() directly. ExtendScript has no SVG parser and no JSON.parse, so
this compilation happens once, ahead of time, not at generate-time in AE.

Usage:  python3 tools/build_parts.py
Reads:  short_run_parts/{parts/**/*.svg, skeleton.json, palettes.json, finish.json}
Writes: tools/parts_data/*.jsx

See docs/parts-pipeline.md for the conventions this depends on (verified
against the pack): SVG path 'd' uses only absolute M/L/C/Z; AE vector groups
render first-created-in-front, SVG renders later-in-front, so we emit groups
in reverse document order; group transform="translate(dx dy)" is flattened
into vertex coordinates.
"""
import json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "short_run_parts")
OUT = os.path.join(ROOT, "tools", "parts_data")

# ============================================================ SVG path parsing

def parse_path(d):
    toks = re.findall(r'[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?', d)
    subpaths = []
    i = 0
    cur = None
    while i < len(toks):
        cmd = toks[i]
        if cmd not in ("M", "L", "C", "Z"):
            raise ValueError("unexpected token %r in path %r" % (cmd, d))
        i += 1
        if cmd == "M":
            x, y = float(toks[i]), float(toks[i+1]); i += 2
            cur = {"closed": False, "vertices": [[x, y]], "out": [[0.0, 0.0]], "in": [[0.0, 0.0]]}
            subpaths.append(cur)
        elif cmd == "L":
            x, y = float(toks[i]), float(toks[i+1]); i += 2
            cur["vertices"].append([x, y]); cur["out"].append([0.0, 0.0]); cur["in"].append([0.0, 0.0])
        elif cmd == "C":
            c1x, c1y = float(toks[i]), float(toks[i+1])
            c2x, c2y = float(toks[i+2]), float(toks[i+3])
            x, y = float(toks[i+4]), float(toks[i+5]); i += 6
            px, py = cur["vertices"][-1]
            cur["out"][-1] = [c1x - px, c1y - py]
            cur["vertices"].append([x, y])
            cur["in"].append([c2x - x, c2y - y])
            cur["out"].append([0.0, 0.0])
        elif cmd == "Z":
            cur["closed"] = True
    return subpaths


def translate_subpaths(subpaths, dx, dy):
    if dx == 0 and dy == 0:
        return subpaths
    return [{"closed": sp["closed"],
              "vertices": [[x + dx, y + dy] for x, y in sp["vertices"]],
              "in": sp["in"], "out": sp["out"]} for sp in subpaths]


def scale_subpaths(subpaths, sx, sy, ox=0.0, oy=0.0):
    """Scale about (ox,oy). Tangent deltas scale like vectors (no offset)."""
    out = []
    for sp in subpaths:
        v = [[ox + (x - ox) * sx, oy + (y - oy) * sy] for x, y in sp["vertices"]]
        o = [[dx * sx, dy * sy] for dx, dy in sp["out"]]
        n = [[dx * sx, dy * sy] for dx, dy in sp["in"]]
        out.append({"closed": sp["closed"], "vertices": v, "out": o, "in": n})
    return out


def round_num(v):
    r = round(v, 3)
    return int(r) if r == int(r) else r


def subpaths_to_js(subpaths):
    parts = []
    for sp in subpaths:
        v = "[" + ",".join("[%s,%s]" % (round_num(x), round_num(y)) for x, y in sp["vertices"]) + "]"
        o = "[" + ",".join("[%s,%s]" % (round_num(x), round_num(y)) for x, y in sp["out"]) + "]"
        n = "[" + ",".join("[%s,%s]" % (round_num(x), round_num(y)) for x, y in sp["in"]) + "]"
        parts.append("{v:%s,o:%s,i:%s,c:%s}" % (v, o, n, "true" if sp["closed"] else "false"))
    return "[" + ",".join(parts) + "]"


# ============================================================ SVG structure parsing

PATH_RE = re.compile(r'<path\b([^>]*?)/?>', re.I)
ATTR_RE = re.compile(r'([a-zA-Z_:][a-zA-Z0-9_:\-]*)="([^"]*)"')
GROUP_OPEN_RE = re.compile(r'<g\b([^>]*)>')
GROUP_CLOSE_RE = re.compile(r'</g>')
TRANSLATE_RE = re.compile(r'translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)')


def get_attrs(attr_str):
    return dict(ATTR_RE.findall(attr_str))


def parse_translate(transform):
    if not transform:
        return (0.0, 0.0)
    m = TRANSLATE_RE.search(transform)
    if not m:
        raise ValueError("unsupported transform: %r" % transform)
    return (float(m.group(1)), float(m.group(2)))


def parse_svg_groups(svg_text):
    """One-level <g id="..."> walk (this pack never nests <g> inside <g>)."""
    groups = []
    pos = 0
    while True:
        m = GROUP_OPEN_RE.search(svg_text, pos)
        if not m:
            break
        attrs = get_attrs(m.group(1))
        gid = attrs.get("id", "g")
        dx, dy = parse_translate(attrs.get("transform"))
        close_m = GROUP_CLOSE_RE.search(svg_text, m.end())
        if not close_m:
            raise ValueError("unclosed <g>")
        body = svg_text[m.end():close_m.start()]
        paths = [get_attrs(pm.group(1)) for pm in PATH_RE.finditer(body)]
        groups.append({"id": gid, "dx": dx, "dy": dy, "paths": paths})
        pos = close_m.end()
    return groups


def compile_path_attrs(attrs, dx, dy):
    d = attrs.get("d")
    if not d:
        return None
    subpaths = translate_subpaths(parse_path(d), dx, dy)
    op = {"shape": subpaths}
    fill, stroke = attrs.get("fill"), attrs.get("stroke")
    if fill and fill != "none":
        op["fillRole"] = attrs.get("data-fill") or "ink"
        if attrs.get("data-knockout") == "1":
            op["knockout"] = True
    if stroke and stroke != "none":
        op["strokeRole"] = attrs.get("data-stroke") or "ink"
        op["strokeWidth"] = float(attrs.get("stroke-width", "4"))
        op["cap"] = attrs.get("stroke-linecap", "round")
        op["join"] = attrs.get("stroke-linejoin", "round")
    return op


def load_groups(path):
    """Returns OrderedDict-like list of (gid, dx, dy, ops[in SVG document order]).
    ops NOT yet reversed — reversal happens at flatten/emit time so callers can
    still do semantic (suffix-based) group inspection first."""
    text = open(path, encoding="utf-8").read()
    out = []
    for g in parse_svg_groups(text):
        ops = [compile_path_attrs(a, g["dx"], g["dy"]) for a in g["paths"]]
        ops = [o for o in ops if o]
        out.append((g["id"], ops))
    return out


def flatten_front_to_back(groups):
    """groups: list of (gid, ops[doc order]). Returns ONE flat ops list in AE
    creation order (first-created = front), for a single-AE-layer part:
    reverse group order, and within each group reverse path order."""
    flat = []
    for gid, ops in reversed(groups):
        flat.extend(reversed(ops))
    return flat


def suffix(gid):
    return re.sub(r'^\d+_', '', gid)


# ============================================================ ES3 literal emission

def js_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


def emit_op(op):
    fields = ["shape:" + subpaths_to_js(op["shape"])]
    if "fillRole" in op:
        fields.append("fillRole:%s" % js_str(op["fillRole"]))
        if op.get("knockout"):
            fields.append("knockout:true")
    if "strokeRole" in op:
        fields.append("strokeRole:%s" % js_str(op["strokeRole"]))
        fields.append("strokeWidth:%s" % round_num(op["strokeWidth"]))
        fields.append("cap:%s" % js_str(op["cap"]))
        fields.append("join:%s" % js_str(op["join"]))
    return "{" + ",".join(fields) + "}"


def emit_ops(ops):
    return "[" + ",".join(emit_op(o) for o in ops) + "]"


def write_jsx(filename, var_name, body_js, header=""):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write("// AUTO-GENERATED by tools/build_parts.py — do not hand-edit.\n")
        if header:
            f.write(header + "\n")
        f.write("var %s = %s;\n" % (var_name, body_js))
    print("wrote", path, "(%d bytes)" % os.path.getsize(path))


def slug(filename):
    base = os.path.splitext(os.path.basename(filename))[0]
    return re.sub(r'[^A-Za-z0-9_]', '_', base)


# ============================================================ category compilers

SIMPLE_CATEGORIES = {
    "eyes": "EYES", "brows": "BROWS", "mouths": "MOUTHS", "noses": "NOSES",
    "ears": "EARS", "glasses": "GLASSES", "facial_hair": "FACIAL_HAIR",
    "accessories": "ACCESSORIES", "shoes": "SHOES",
}


def compile_simple_category(subdir):
    d = os.path.join(SRC, "parts", subdir)
    entries = []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".svg"):
            continue
        pid = slug(fn)
        groups = load_groups(os.path.join(d, fn))
        ops = flatten_front_to_back(groups)
        entries.append((pid, ops))
    return entries


def compile_heads():
    d = os.path.join(SRC, "parts", "heads")
    entries = []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".svg"):
            continue
        # Key by the short id ("H1".."H6"), matching skeleton.json's heads[].id
        # — character_gen.jsx looks heads up by that id, same as it does for
        # bodies (which are already keyed short, see compile_bodies()).
        pid = slug(fn).split("_")[0]
        groups = load_groups(os.path.join(d, fn))
        # drop the baked-in "ears" group — ears are an independent slot now.
        groups = [(gid, ops) for gid, ops in groups if suffix(gid) != "ears"]
        ops = flatten_front_to_back(groups)
        entries.append((pid, ops))
    return entries


def compile_hair():
    d = os.path.join(SRC, "parts", "hair")
    entries = []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".svg"):
            continue
        pid = slug(fn)
        groups = load_groups(os.path.join(d, fn))
        by_suffix = {}
        for gid, ops in groups:
            by_suffix.setdefault(suffix(gid), []).append((gid, ops))
        back = flatten_front_to_back(by_suffix.get("back", []))
        front = flatten_front_to_back(by_suffix.get("front", []))
        entries.append((pid, back, front))
    return entries


BODY_IDS = ["B1_bean", "B2_pear", "B3_wedge", "B4_barrel", "B5_reed", "B6_runt"]
BASE_SILHOUETTE_SUFFIXES = ["torso", "pelvis", "top", "neckline"]
SHARED_LIMB_SUFFIXES = {"leg", "pant", "cuff", "band", "shoe", "arm", "sleeve", "hand", "neck", "h"}


def compile_bodies():
    """Per body archetype: torso/pelvis/top/neckline ops, extracted directly
    (each body file already has its own hand-fit silhouette — no retargeting
    math needed for the base body)."""
    out = {}
    for bid in BODY_IDS:
        path = os.path.join(SRC, "parts", "bodies", bid + ".svg")
        groups = load_groups(path)
        by_suffix = {}
        for gid, ops in groups:
            by_suffix.setdefault(suffix(gid), []).append((gid, ops))
        rec = {}
        for suf in BASE_SILHOUETTE_SUFFIXES:
            rec[suf] = flatten_front_to_back(by_suffix.get(suf, []))
        out[bid.split("_")[0]] = rec  # key by "B1".."B6"
    return out


def compile_garments(category, ids):
    """category: "tops" or "bottoms". Diffs each garment file's torso/pelvis/
    top/neckline groups against B1 (the reference every garment is authored
    against) by semantic suffix. Classifies each as 'same' (skip — the body
    provides it), 'missing' (garment omits it — e.g. hood covers the
    neckline), or an override (real geometry, authored in B1 space, needs
    retargeting to other bodies at generate time). Any group whose suffix
    isn't in the base set and isn't shared-limb content is kept verbatim as
    an "extra" overlay (hood, skirt, bib, hemband, collar, flare, ...) — also
    authored in B1 space."""
    base_path = os.path.join(SRC, "parts", "bodies", "B1_bean.svg")
    base_groups = load_groups(base_path)
    base_by_suffix = {}
    for gid, ops in base_groups:
        base_by_suffix.setdefault(suffix(gid), []).append((gid, ops))
    base_flat = {suf: flatten_front_to_back(base_by_suffix.get(suf, [])) for suf in BASE_SILHOUETTE_SUFFIXES}

    def ops_equal(a, b):
        return emit_ops(a) == emit_ops(b)

    entries = []
    for gid_file in ids:
        path = os.path.join(SRC, "parts", category, gid_file + ".svg")
        groups = load_groups(path)
        by_suffix = {}
        order = []
        for gid, ops in groups:
            suf = suffix(gid)
            by_suffix.setdefault(suf, []).append((gid, ops))
            if suf not in order:
                order.append(suf)

        overrides = {}
        for suf in BASE_SILHOUETTE_SUFFIXES:
            if suf not in by_suffix:
                overrides[suf] = "omit" if suf in base_flat and base_flat[suf] else None
                continue
            flat = flatten_front_to_back(by_suffix[suf])
            if suf in base_flat and ops_equal(flat, base_flat[suf]):
                overrides[suf] = None  # same as base body — nothing to override
            else:
                overrides[suf] = flat  # genuine override, authored in B1 space

        extras = []
        for suf in order:
            if suf in BASE_SILHOUETTE_SUFFIXES or suf in SHARED_LIMB_SUFFIXES:
                continue
            extras.append((suf, flatten_front_to_back(by_suffix[suf])))

        entries.append({"id": slug(gid_file), "overrides": overrides, "extras": extras})
    return entries


TOP_IDS = ["T1_tee", "T2_tank", "T3_turtleneck", "T4_polo", "T5_hoodie", "T6_vest", "T7_dress", "T8_jersey"]
BOTTOM_IDS = ["U1_shorts", "U2_trousers", "U3_knickers", "U4_a-line-skirt", "U5_dungarees", "U6_flares"]


def emit_garment(entry):
    parts = ['id:%s' % js_str(entry["id"])]
    ov_parts = []
    for suf, val in entry["overrides"].items():
        if val is None:
            continue
        if val == "omit":
            ov_parts.append("%s:%s" % (js_str(suf), js_str("omit")))
        else:
            ov_parts.append("%s:%s" % (js_str(suf), emit_ops(val)))
    parts.append("overrides:{%s}" % ",".join(ov_parts))
    ex_parts = ["{suffix:%s,ops:%s}" % (js_str(suf), emit_ops(ops)) for suf, ops in entry["extras"]]
    parts.append("extras:[%s]" % ",".join(ex_parts))
    return "{" + ",".join(parts) + "}"


# ============================================================ palettes / finish / skeleton

def emit_hexmap(d):
    return "{" + ",".join("%s:%s" % (js_str(k), js_str(v)) for k, v in d.items()) + "}"


def compile_palettes():
    data = json.load(open(os.path.join(SRC, "palettes.json")))
    pal_entries = []
    for p in data["palettes"]:
        roles = emit_hexmap(p["roles"])
        budget = "{" + ",".join("%s:%s" % (js_str(k), v) for k, v in p["area_budget"].items()) + "}"
        pal_entries.append("{id:%s,name:%s,roles:%s,area_budget:%s}" % (
            js_str(p["id"]), js_str(p["name"]), roles, budget))
    skin_ramp = "[" + ",".join("{id:%s,name:%s,hex:%s}" % (js_str(s["id"]), js_str(s["name"]), js_str(s["hex"])) for s in data["skin_ramp"]) + "]"
    body = "{stock:%s,blush:%s,lens:%s,skin_ramp:%s,palettes:[%s]}" % (
        js_str(data["stock"]), js_str(data["blush"]), js_str(data["lens"]), skin_ramp, ",".join(pal_entries))
    return body


def compile_finish():
    data = json.load(open(os.path.join(SRC, "finish.json")))
    def obj(d):
        fields = []
        for k, v in d.items():
            if isinstance(v, dict):
                fields.append("%s:%s" % (js_str(k), obj(v)))
            elif isinstance(v, list):
                fields.append("%s:[%s]" % (js_str(k), ",".join(js_str(x) if isinstance(x, str) else str(x) for x in v)))
            elif isinstance(v, bool):
                fields.append("%s:%s" % (js_str(k), "true" if v else "false"))
            elif isinstance(v, str):
                fields.append("%s:%s" % (js_str(k), js_str(v)))
            else:
                fields.append("%s:%s" % (js_str(k), v))
        return "{" + ",".join(fields) + "}"
    return obj(data)


def compile_skeleton():
    data = json.load(open(os.path.join(SRC, "skeleton.json")))
    hf = data["head_frame"]
    hf_js = "{eye:{x:%s,y:%s},brow_y:%s,nose_y:%s,mouth_y:%s}" % (hf["eye"]["x"], hf["eye"]["y"], hf["brow_y"], hf["nose_y"], hf["mouth_y"])
    heads_js = "[" + ",".join(
        "{id:%s,name:%s,rx:%s,ry:%s,superellipse_n:%s,lean:%s,chin:%s}" % (
            js_str(h["id"]), js_str(h["name"]), h["rx"], h["ry"], h["superellipse_n"], h["lean"], h["chin"]
        ) for h in data["heads"]) + "]"
    bodies_js_parts = []
    for b in data["bodies"]:
        p = b["params"]; a = b["anchors"]
        params_js = "{" + ",".join("%s:%s" % (js_str(k), v) for k, v in p.items()) + "}"
        anchors_js = "{neck:[%s,%s],shoulder:[%s,%s],wrist:[%s,%s],hip:[%s,%s],ankle:[%s,%s],ground:%s,hem:%s}" % (
            a["neck"][0], a["neck"][1], a["shoulder"][0], a["shoulder"][1], a["wrist"][0], a["wrist"][1],
            a["hip"][0], a["hip"][1], a["ankle"][0], a["ankle"][1], a["ground"], a["hem"])
        bodies_js_parts.append("{id:%s,name:%s,params:%s,anchors:%s}" % (js_str(b["id"]), js_str(b["name"]), params_js, anchors_js))
    bodies_js = "[" + ",".join(bodies_js_parts) + "]"
    return "{chin_y:%s,torso_top_y:%s,arm_rest_angle_deg:%s,stroke:{contour:%s,feature:%s},head_frame:%s,heads:%s,bodies:%s}" % (
        data["chin_y"], data["torso_top_y"], data["arm_rest_angle_deg"],
        data["stroke"]["contour"], data["stroke"]["feature"], hf_js, heads_js, bodies_js)


# ============================================================ main

def main():
    os.makedirs(OUT, exist_ok=True)

    # -- simple flat categories --
    for subdir, var in SIMPLE_CATEGORIES.items():
        entries = compile_simple_category(subdir)
        body = "{" + ",".join("%s:%s" % (js_str(pid), emit_ops(ops)) for pid, ops in entries) + "}"
        write_jsx("%s.jsx" % subdir, var, body)
        print("  %s: %d parts" % (var, len(entries)))

    # -- heads (ears stripped) --
    entries = compile_heads()
    body = "{" + ",".join("%s:%s" % (js_str(pid), emit_ops(ops)) for pid, ops in entries) + "}"
    write_jsx("heads.jsx", "HEADS", body)
    print("  HEADS: %d parts" % len(entries))

    # -- hair (back/front) --
    entries = compile_hair()
    body = "{" + ",".join("%s:{back:%s,front:%s}" % (js_str(pid), emit_ops(back), emit_ops(front)) for pid, back, front in entries) + "}"
    write_jsx("hair.jsx", "HAIR", body)
    print("  HAIR: %d parts" % len(entries))

    # -- bodies --
    bodies = compile_bodies()
    body_js = "{" + ",".join("%s:{%s}" % (js_str(bid), ",".join("%s:%s" % (js_str(suf), emit_ops(ops)) for suf, ops in rec.items())) for bid, rec in bodies.items()) + "}"
    write_jsx("bodies.jsx", "BODIES", body_js)
    print("  BODIES: %d archetypes" % len(bodies))

    # -- garments --
    tops = compile_garments("tops", TOP_IDS)
    write_jsx("tops.jsx", "TOPS", "[" + ",".join(emit_garment(e) for e in tops) + "]")
    print("  TOPS: %d garments" % len(tops))
    for e in tops:
        ov = [k for k, v in e["overrides"].items() if v]
        print("    %s: overrides=%s extras=%s" % (e["id"], ov, [x[0] for x in e["extras"]]))

    bottoms = compile_garments("bottoms", BOTTOM_IDS)
    write_jsx("bottoms.jsx", "BOTTOMS", "[" + ",".join(emit_garment(e) for e in bottoms) + "]")
    print("  BOTTOMS: %d garments" % len(bottoms))
    for e in bottoms:
        ov = [k for k, v in e["overrides"].items() if v]
        print("    %s: overrides=%s extras=%s" % (e["id"], ov, [x[0] for x in e["extras"]]))

    # -- palettes / finish / skeleton --
    write_jsx("palettes.jsx", "PALETTE_DATA", compile_palettes())
    write_jsx("finish.jsx", "FINISH_DATA", compile_finish())
    write_jsx("skeleton.jsx", "SKELETON", compile_skeleton())

    print("\nbuild_parts.py: done.")


if __name__ == "__main__":
    main()
