/*
 * character_builder.jsx — Character Builder core (Milestone 2).
 *
 * The genome + parts library + rig, all data-driven. A character is a
 * plain object (see rollGenome); buildCharacter(comp, genome, origin)
 * turns it into a fully rigged rubber-hose character. The rig itself is
 * the spike from Milestone 1 (see docs/rigging-notes.md).
 *
 * Run directly in AE (File > Scripts > Run Script File...) to build one
 * random character into a fresh comp. Automation hooks:
 *   $.global.CB_SEED   — force a seed (else random)
 *   $.global.CB_LOCKS  — pipe list of locked groups, e.g. "palette|legs"
 *   $.global.CB_TEXTURE— texture style: "none"|"grain"|"rough"|"boil"
 *   $.global.CB_QUIET  — 1 to suppress the completion alert
 *   $.global.CB_ORIGIN — "x,y" to offset the build (multi-char comps)
 *
 * ES3 / ExtendScript only. Exits cleanly under jsc for syntax checks.
 */

// ============================================================ guard
if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") {
        print("character_builder: not inside After Effects (syntax check only).");
    }
} else {
    (function () {

    // ======================================================== PRNG
    // 32-bit multiply (Math.imul polyfill — ExtendScript lacks it).
    function imul(a, b) {
        a = a >>> 0; b = b >>> 0;
        var ah = (a >>> 16) & 0xffff, al = a & 0xffff;
        var bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
        return ((al * bl) + ((((ah * bl + al * bh) & 0xffff) << 16) >>> 0)) >>> 0;
    }
    // Nonlinear hash so nearby seeds diverge (raw xorshift keeps them
    // correlated -> palettes clustered on one value).
    function hash32(x) {
        x = x >>> 0;
        x ^= x >>> 16; x = imul(x, 0x7feb352d);
        x ^= x >>> 15; x = imul(x, 0x846ca68b);
        x ^= x >>> 16;
        return x >>> 0;
    }
    // xorshift stream seeded from the hashed seed.
    function PRNG(seed) {
        this.s = hash32((seed >>> 0) || 1) || 1;
    }
    PRNG.prototype.next = function () {
        // xorshift-ish; good enough for character variety
        var x = this.s;
        x ^= x << 13; x = x >>> 0;
        x ^= x >> 17;
        x ^= x << 5; x = x >>> 0;
        this.s = x;
        return (x >>> 0) / 4294967296;
    };
    PRNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
    PRNG.prototype.intRange = function (a, b) { return Math.floor(this.range(a, b + 1)); };
    PRNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
    PRNG.prototype.chance = function (p) { return this.next() < p; };

    // ==================================================== palettes
    var PALETTES = [
        { name: "Mustard", ink: [0.09, 0.08, 0.08], body: [0.90, 0.71, 0.28], skin: [0.96, 0.90, 0.79], glove: [0.98, 0.97, 0.93], shoe: [0.10, 0.09, 0.09], accent: [0.79, 0.28, 0.24], cheek: [0.93, 0.55, 0.42] },
        { name: "Teal", ink: [0.07, 0.10, 0.11], body: [0.24, 0.60, 0.60], skin: [0.98, 0.88, 0.77], glove: [0.98, 0.97, 0.93], shoe: [0.11, 0.14, 0.16], accent: [0.94, 0.62, 0.28], cheek: [0.95, 0.60, 0.45] },
        { name: "Rose", ink: [0.16, 0.08, 0.10], body: [0.86, 0.44, 0.48], skin: [0.99, 0.90, 0.82], glove: [0.99, 0.97, 0.94], shoe: [0.20, 0.10, 0.12], accent: [0.36, 0.28, 0.55], cheek: [0.90, 0.50, 0.52] },
        { name: "Cobalt", ink: [0.06, 0.07, 0.12], body: [0.24, 0.36, 0.66], skin: [0.97, 0.87, 0.76], glove: [0.97, 0.96, 0.92], shoe: [0.09, 0.10, 0.14], accent: [0.95, 0.76, 0.28], cheek: [0.92, 0.58, 0.50] },
        { name: "Moss", ink: [0.09, 0.11, 0.07], body: [0.52, 0.60, 0.28], skin: [0.97, 0.89, 0.78], glove: [0.98, 0.97, 0.92], shoe: [0.13, 0.13, 0.09], accent: [0.86, 0.40, 0.24], cheek: [0.90, 0.56, 0.44] },
        { name: "Grape", ink: [0.10, 0.07, 0.12], body: [0.47, 0.33, 0.60], skin: [0.98, 0.88, 0.79], glove: [0.98, 0.97, 0.93], shoe: [0.12, 0.09, 0.14], accent: [0.95, 0.72, 0.30], cheek: [0.92, 0.56, 0.52] }
    ];

    // ============================================= variant options
    var HEADS = ["round", "egg", "pear"];
    var TORSOS = ["bean", "pear", "barrel"];
    var EYES = ["dot", "oval", "pie"];
    var MOUTHS = ["smile", "grin", "oh"];
    var GLOVES = ["mitt", "fourfinger"];
    var SHOES = ["round", "long"];
    var HATS = ["none", "none", "bowler", "tophat", "beanie"]; // none weighted

    var OUTLINE_W = 8;

    // ============================================= draw primitives
    function newShapeLayer(comp, name) {
        var l = comp.layers.addShape();
        l.name = name;
        return l;
    }
    function rootVec(layer, name) {
        var g = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        g.name = name;
        return g.property("ADBE Vectors Group");
    }
    function ellipse(vec, center, size) {
        var e = vec.addProperty("ADBE Vector Shape - Ellipse");
        e.property("ADBE Vector Ellipse Size").setValue(size);
        e.property("ADBE Vector Ellipse Position").setValue(center);
        return e;
    }
    function rect(vec, center, size, round) {
        var r = vec.addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue(size);
        r.property("ADBE Vector Rect Position").setValue(center);
        r.property("ADBE Vector Rect Roundness").setValue(round);
        return r;
    }
    function path(vec, verts, ins, outs, closed) {
        var pg = vec.addProperty("ADBE Vector Shape - Group");
        var s = new Shape();
        s.vertices = verts;
        s.inTangents = ins;
        s.outTangents = outs;
        s.closed = closed;
        pg.property("ADBE Vector Shape").setValue(s);
        return pg;
    }
    function fill(vec, color) {
        var f = vec.addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").setValue(color);
        return f;
    }
    function stroke(vec, color, width) {
        var s = vec.addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(color);
        s.property("ADBE Vector Stroke Width").setValue(width);
        try { s.property("ADBE Vector Stroke Line Cap").setValue(2); } catch (e) {}
        try { s.property("ADBE Vector Stroke Line Join").setValue(2); } catch (e2) {}
        return s;
    }
    function slider(layer, name, value) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property("ADBE Slider Control-0001").setValue(value);
        return fx;
    }
    function setPos(layer, p) {
        layer.property("ADBE Transform Group").property("ADBE Position").setValue(p);
    }
    function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }

    function parentTo(child, parent, childW, parentW) {
        child.parent = parent;
        setPos(child, sub2(childW, parentW));
    }

    // ================================================ part shapes
    // Each generator draws into `head`/`torso`/etc. layer's vec group,
    // origin at the layer's anchor, using palette `pal`.

    function drawHead(vec, style, r, pal) {
        // r = base head radius
        if (style === "round") {
            ellipse(vec, [0, 0], [r * 2, r * 2]);
        } else if (style === "egg") {
            ellipse(vec, [0, -r * 0.08], [r * 1.8, r * 2.2]);
        } else { // pear: wider jaw
            path(vec,
                [[0, -r], [r * 0.95, -r * 0.1], [r * 0.62, r * 0.95], [-r * 0.62, r * 0.95], [-r * 0.95, -r * 0.1]],
                [[-r * 0.6, 0], [0, -r * 0.5], [r * 0.4, -r * 0.1], [r * 0.2, r * 0.2], [0, -r * 0.5]],
                [[r * 0.6, 0], [0, r * 0.5], [-r * 0.2, r * 0.2], [-r * 0.4, -r * 0.1], [0, r * 0.5]],
                true);
        }
        fill(vec, pal.skin);
        stroke(vec, pal.ink, OUTLINE_W);
    }

    // Two rules here, both from AE shape-layer behavior:
    //  1) The FIRST group created renders in FRONT (verified). So draw
    //     front-to-back: highlight, then pupil, then white eyeball.
    //  2) Adding a new group invalidates earlier group-content refs on
    //     the same layer, so finish drawing into a group before creating
    //     the next and never touch a prior one again.
    function drawEyes(head, style, r, pal) {
        var ex = r * 0.36, ey = -r * 0.16;
        if (style === "dot") {
            var dv = rootVec(head, "Eyes");
            ellipse(dv, [-ex, ey], [r * 0.22, r * 0.22]);
            ellipse(dv, [ex, ey], [r * 0.22, r * 0.22]);
            fill(dv, pal.ink);
        } else if (style === "oval") {
            var ev = rootVec(head, "Pupils"); // front
            ellipse(ev, [-ex, ey + r * 0.03], [r * 0.2, r * 0.28]);
            ellipse(ev, [ex, ey + r * 0.03], [r * 0.2, r * 0.28]);
            fill(ev, pal.ink);
            var wv = rootVec(head, "EyeWhites"); // back
            ellipse(wv, [-ex, ey], [r * 0.36, r * 0.52]);
            ellipse(wv, [ex, ey], [r * 0.36, r * 0.52]);
            fill(wv, [0.99, 0.99, 0.98]);
            stroke(wv, pal.ink, OUTLINE_W * 0.6);
        } else { // big round pupils with a highlight — cute rubber-hose
            var hv = rootVec(head, "EyeHi"); // front-most highlight dots
            ellipse(hv, [-ex + r * 0.11, ey - r * 0.07], [r * 0.09, r * 0.09]);
            ellipse(hv, [ex + r * 0.11, ey - r * 0.07], [r * 0.09, r * 0.09]);
            fill(hv, [0.99, 0.99, 0.98]);
            var pv = rootVec(head, "Pupils"); // middle
            ellipse(pv, [-ex + r * 0.04, ey + r * 0.02], [r * 0.27, r * 0.31]);
            ellipse(pv, [ex + r * 0.04, ey + r * 0.02], [r * 0.27, r * 0.31]);
            fill(pv, pal.ink);
            var wv2 = rootVec(head, "EyeWhites"); // back
            ellipse(wv2, [-ex, ey], [r * 0.44, r * 0.44]);
            ellipse(wv2, [ex, ey], [r * 0.44, r * 0.44]);
            fill(wv2, [0.99, 0.99, 0.98]);
            stroke(wv2, pal.ink, OUTLINE_W * 0.6);
        }
    }

    function drawMouth(head, style, r, pal) {
        var mv = rootVec(head, "Mouth");
        var my = r * 0.44;
        if (style === "smile") {
            path(mv, [[-r * 0.3, my - r * 0.06], [0, my + r * 0.12], [r * 0.3, my - r * 0.06]],
                [[0, 0], [-r * 0.12, 0], [-r * 0.1, r * 0.05]],
                [[r * 0.1, r * 0.05], [r * 0.12, 0], [0, 0]], false);
            stroke(mv, pal.ink, OUTLINE_W * 0.8);
        } else if (style === "grin") {
            // open grin: filled mouth
            path(mv, [[-r * 0.34, my - r * 0.04], [0, my + r * 0.2], [r * 0.34, my - r * 0.04]],
                [[0, 0], [-r * 0.16, 0], [0, 0]], [[0, 0], [r * 0.16, 0], [0, 0]], true);
            fill(mv, [0.35, 0.12, 0.14]);
            stroke(mv, pal.ink, OUTLINE_W * 0.7);
        } else { // oh
            ellipse(mv, [0, my + r * 0.02], [r * 0.26, r * 0.32]);
            fill(mv, [0.35, 0.12, 0.14]);
            stroke(mv, pal.ink, OUTLINE_W * 0.7);
        }
    }

    function drawTorso(vec, style, w, h, pal) {
        if (style === "bean") {
            ellipse(vec, [0, -h * 0.5], [w, h]);
        } else if (style === "pear") {
            // narrow shoulders, wide hips
            path(vec,
                [[0, -h], [w * 0.42, -h * 0.62], [w * 0.55, -h * 0.05], [0, 0], [-w * 0.55, -h * 0.05], [-w * 0.42, -h * 0.62]],
                [[-w * 0.28, 0], [0, -h * 0.22], [0, -h * 0.28], [w * 0.34, 0], [0, h * 0.1], [0, h * 0.22]],
                [[w * 0.28, 0], [0, h * 0.28], [0, h * 0.28], [-w * 0.34, 0], [0, -h * 0.1], [0, -h * 0.22]],
                true);
        } else { // barrel
            rect(vec, [0, -h * 0.5], [w * 0.92, h], w * 0.42);
        }
        fill(vec, pal.body);
        stroke(vec, pal.ink, OUTLINE_W);
    }

    function drawGlove(vec, style, r, pal) {
        if (style === "mitt") {
            ellipse(vec, [0, 0], [r * 2, r * 2]);
            fill(vec, pal.glove);
            stroke(vec, pal.ink, OUTLINE_W);
        } else { // fourfinger: rounded palm + thumb bump
            ellipse(vec, [0, 0], [r * 2, r * 1.9]);
            ellipse(vec, [-r * 0.85, -r * 0.3], [r * 0.7, r * 0.9]);
            fill(vec, pal.glove);
            stroke(vec, pal.ink, OUTLINE_W);
        }
    }

    function drawShoe(vec, style, s, dir, pal) {
        // dir: +1 toes point right, -1 left
        if (style === "round") {
            ellipse(vec, [dir * 14 * s, -14 * s], [95 * s, 48 * s]);
        } else { // long
            ellipse(vec, [dir * 30 * s, -12 * s], [130 * s, 46 * s]);
        }
        fill(vec, pal.shoe);
        stroke(vec, pal.ink, OUTLINE_W);
    }

    function drawHat(comp, style, headCW, r, pal, off) {
        if (style === "none") return null;
        var l = newShapeLayer(comp, "Hat");
        var w = headCW[0], hy = headCW[1];
        setPos(l, [w + off[0], hy + off[1]]);
        // Groups are created front-to-back (first = front); never reuse a
        // group reference after creating a newer one on the same layer.
        if (style === "bowler") {
            var bo = rootVec(l, "Hat");
            ellipse(bo, [0, -r * 0.9], [r * 1.7, r * 1.3]);           // dome
            rect(bo, [0, -r * 0.55], [r * 2.6, r * 0.28], r * 0.14);  // brim
            fill(bo, pal.ink);
        } else if (style === "tophat") {
            var band = rootVec(l, "Band");                            // front
            rect(band, [0, -r * 0.95], [r * 1.5, r * 0.26], 0);
            fill(band, pal.accent);
            var stack = rootVec(l, "Stack");                          // back
            rect(stack, [0, -r * 1.5], [r * 1.5, r * 1.7], r * 0.1);
            rect(stack, [0, -r * 0.62], [r * 2.7, r * 0.26], r * 0.12);
            fill(stack, pal.ink);
        } else { // beanie
            var pom = rootVec(l, "Pom");                              // front
            ellipse(pom, [0, -r * 1.55], [r * 0.42, r * 0.42]);
            fill(pom, pal.glove);
            stroke(pom, pal.ink, OUTLINE_W * 0.7);
            var cone = rootVec(l, "Cone");                            // back
            path(cone, [[-r * 0.95, -r * 0.55], [0, -r * 1.5], [r * 0.95, -r * 0.55]],
                [[0, 0], [-r * 0.5, 0], [0, 0]], [[0, 0], [r * 0.5, 0], [0, 0]], true);
            fill(cone, pal.accent);
            stroke(cone, pal.ink, OUTLINE_W);
        }
        return l;
    }

    // ================================================ limb (hose)
    function neg(v) { return [-v[0], -v[1]]; }
    function hoseExpr(ctrlName) {
        return "" +
            "function neg(v){return [-v[0],-v[1]];}\n" +
            "var C=thisComp.layer(\"" + ctrlName + "\");\n" +
            "var tgt=fromWorld(C.toWorld([0,0]));\n" +
            "var L=effect(\"Limb Length\")(\"Slider\");\n" +
            "var dir=effect(\"Bend Dir\")(\"Slider\");\n" +
            "var d=length(tgt); if(d<0.001){tgt=[0.001,0];d=0.001;}\n" +
            "var u=tgt/d;\n" +
            "var end=u*d;\n" +
            "var sag=0.5*Math.sqrt(Math.max(L*L-d*d,0));\n" +
            "var n=[-u[1],u[0]];\n" +
            "var mid=end*0.5+n*(sag*dir);\n" +
            "var t0=mid/4, t1=end/4, t2=(end-mid)/4;\n" +
            "createPath([[0,0],mid,end],[[0,0],neg(t1),neg(t2)],[t0,t1,[0,0]],false);";
    }
    function makeLimb(comp, name, rootW, ctrlName, len, bendDir, width, taperEnd, pal, color) {
        var l = newShapeLayer(comp, name);
        setPos(l, rootW);
        var v = rootVec(l, "Hose");
        path(v, [[0, 0], [0, len]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false);
        var st = stroke(v, color || pal.ink, width);
        // Taper thick (root) -> thin (tip) for the rubber-hose look.
        try {
            var tp = st.property("ADBE Vector Stroke Taper");
            tp.property("ADBE Vector Taper Start Width").setValue(100);
            tp.property("ADBE Vector Taper End Width").setValue(taperEnd);
        } catch (eT) {}
        slider(l, "Limb Length", len);
        slider(l, "Bend Dir", bendDir);
        l.label = 8;
        return { layer: l, ctrlName: ctrlName };
    }
    function limbPath(l) {
        return l.property("ADBE Root Vectors Group").property("Hose")
            .property("ADBE Vectors Group").property(1).property("ADBE Vector Shape");
    }

    function makeController(comp, name, world, drawFn, noFill) {
        var l = newShapeLayer(comp, name);
        setPos(l, world);
        var v = rootVec(l, "Ctrl");
        drawFn(v);
        stroke(v, [0.90, 0.25, 0.20], noFill ? 10 : 4);
        if (!noFill) {
            var f = fill(v, [0.90, 0.25, 0.20]);
            try { f.property("ADBE Vector Fill Opacity").setValue(12); } catch (e) {}
        }
        l.guideLayer = true;
        l.label = 1;
        return l;
    }

    // =================================================== layout
    // Derive all world positions/sizes from proportions `pr`.
    function layout(pr, o) {
        var cx = 540 + o[0], hipY = 700 + o[1];
        var chestY = hipY - pr.torsoH;
        // Head overlaps the torso top so only a short neck shows; the
        // neck hose roots INSIDE the torso and runs up behind the head.
        var headCY = chestY - pr.headR * 0.85 - pr.neck;
        return {
            master: [cx, hipY + 250],
            hips: [cx, hipY],
            torso: [cx, hipY],
            chest: [cx, chestY],
            neckRoot: [cx, chestY + 22],
            head: [cx, headCY],
            shoulderL: [cx - pr.shoulderHalf, chestY + 6],
            shoulderR: [cx + pr.shoulderHalf, chestY + 6],
            handL: [cx - pr.handRestX, chestY + pr.armLen * 0.7],
            handR: [cx + pr.handRestX, chestY + pr.armLen * 0.7],
            hipJointL: [cx - pr.hipHalf, hipY + 18],
            hipJointR: [cx + pr.hipHalf, hipY + 18],
            footL: [cx - pr.footRestX, hipY + pr.legLen],
            footR: [cx + pr.footRestX, hipY + pr.legLen]
        };
    }

    // ================================================== genome
    function rollProportions(rng) {
        var headR = rng.range(88, 108);
        var torsoH = rng.range(210, 285);
        var torsoW = rng.range(180, 235);
        return {
            headR: headR,
            neck: rng.range(12, 34),
            torsoH: torsoH,
            torsoW: torsoW,
            shoulderHalf: torsoW * rng.range(0.34, 0.42),
            hipHalf: torsoW * rng.range(0.2, 0.28),
            handRestX: torsoW * rng.range(0.82, 1.0),
            armLen: rng.range(200, 255),
            legLen: rng.range(210, 270),
            footRestX: rng.range(58, 84),
            armW: rng.range(20, 30),
            legW: rng.range(24, 34),
            handR: rng.range(30, 38),
            footScale: rng.range(0.88, 1.18)
        };
    }

    // Which genome fields each lock group owns.
    function rollGenome(seed, locks, prev) {
        locks = locks || {};
        var rng = new PRNG(seed);
        var g = { seed: seed, slots: {}, prop: {} };

        // palette
        g.slots.palette = (locks.palette && prev) ? prev.slots.palette : rng.intRange(0, PALETTES.length - 1);
        // head group: shape + eyes + mouth + hat
        if (locks.head && prev) {
            g.slots.head = prev.slots.head; g.slots.eyes = prev.slots.eyes;
            g.slots.mouth = prev.slots.mouth; g.slots.hat = prev.slots.hat;
        } else {
            g.slots.head = rng.intRange(0, HEADS.length - 1);
            g.slots.eyes = rng.intRange(0, EYES.length - 1);
            g.slots.mouth = rng.intRange(0, MOUTHS.length - 1);
            g.slots.hat = rng.intRange(0, HATS.length - 1);
        }
        // torso
        g.slots.torso = (locks.torso && prev) ? prev.slots.torso : rng.intRange(0, TORSOS.length - 1);
        // arms: gloves
        g.slots.gloves = (locks.arms && prev) ? prev.slots.gloves : rng.intRange(0, GLOVES.length - 1);
        // legs: shoes
        g.slots.shoes = (locks.legs && prev) ? prev.slots.shoes : rng.intRange(0, SHOES.length - 1);

        // proportions: roll fresh, then overwrite locked groups from prev
        var pr = rollProportions(rng);
        if (prev) {
            if (locks.head) { pr.headR = prev.prop.headR; pr.neck = prev.prop.neck; }
            if (locks.torso) { pr.torsoH = prev.prop.torsoH; pr.torsoW = prev.prop.torsoW; pr.shoulderHalf = prev.prop.shoulderHalf; pr.hipHalf = prev.prop.hipHalf; }
            if (locks.arms) { pr.armLen = prev.prop.armLen; pr.armW = prev.prop.armW; pr.handR = prev.prop.handR; pr.handRestX = prev.prop.handRestX; }
            if (locks.legs) { pr.legLen = prev.prop.legLen; pr.legW = prev.prop.legW; pr.footScale = prev.prop.footScale; pr.footRestX = prev.prop.footRestX; }
        }
        g.prop = pr;
        return g;
    }

    // Serialize a genome onto the master layer comment (ES3, no JSON).
    function genomeToString(g) {
        var parts = ["CB2", "seed=" + g.seed];
        var sk = ["palette", "head", "eyes", "mouth", "hat", "torso", "gloves", "shoes"];
        for (var i = 0; i < sk.length; i++) parts.push(sk[i] + "=" + g.slots[sk[i]]);
        var pk = [];
        for (var k in g.prop) if (g.prop.hasOwnProperty(k)) pk.push("p_" + k + "=" + g.prop[k]);
        return parts.join("|") + "|" + pk.join("|");
    }

    // ============================================ build one character
    function buildCharacter(comp, g, o) {
        var pal = PALETTES[g.slots.palette];
        var pr = g.prop;
        var P = layout(pr, o);

        // --- limbs (built first so body overlaps their sockets) ---
        var legL = makeLimb(comp, "Leg_L", P.hipJointL, "C_Foot_L", pr.legLen, 1, pr.legW, 55, pal);
        var legR = makeLimb(comp, "Leg_R", P.hipJointR, "C_Foot_R", pr.legLen, -1, pr.legW, 55, pal);

        var shoeL = newShapeLayer(comp, "Shoe_L"); setPos(shoeL, P.footL);
        drawShoe(rootVec(shoeL, "Shoe"), SHOES[g.slots.shoes], pr.footScale, -1, pal);
        var shoeR = newShapeLayer(comp, "Shoe_R"); setPos(shoeR, P.footR);
        drawShoe(rootVec(shoeR, "Shoe"), SHOES[g.slots.shoes], pr.footScale, 1, pal);

        // Neck: skin-colored, thick, length = rest distance so it stands
        // straight (taut) at rest and only bows when the head is pulled.
        var neckDist = Math.abs(P.neckRoot[1] - P.head[1]);
        var neck = makeLimb(comp, "Neck", P.neckRoot, "C_Head", neckDist, 1, pr.headR * 0.72, 90, pal, pal.skin);

        var torso = newShapeLayer(comp, "Torso"); setPos(torso, P.torso);
        drawTorso(rootVec(torso, "Body"), TORSOS[g.slots.torso], pr.torsoW, pr.torsoH, pal);

        var head = newShapeLayer(comp, "Head"); setPos(head, P.head);
        drawMouth(head, MOUTHS[g.slots.mouth], pr.headR, pal);
        drawEyes(head, EYES[g.slots.eyes], pr.headR, pal);
        drawHead(rootVec(head, "Skull"), HEADS[g.slots.head], pr.headR, pal);

        var hat = drawHat(comp, HATS[g.slots.hat], P.head, pr.headR, pal, [0, -pr.headR * 0.55]);

        var armL = makeLimb(comp, "Arm_L", P.shoulderL, "C_Hand_L", pr.armLen, 1, pr.armW, 45, pal);
        var armR = makeLimb(comp, "Arm_R", P.shoulderR, "C_Hand_R", pr.armLen, -1, pr.armW, 45, pal);

        var gloveL = newShapeLayer(comp, "Glove_L"); setPos(gloveL, P.handL);
        drawGlove(rootVec(gloveL, "Glove"), GLOVES[g.slots.gloves], pr.handR, pal);
        var gloveR = newShapeLayer(comp, "Glove_R"); setPos(gloveR, P.handR);
        drawGlove(rootVec(gloveR, "Glove"), GLOVES[g.slots.gloves], pr.handR, pal);

        // --- controllers ---
        var cMaster = makeController(comp, "C_Master", P.master, function (v) { rect(v, [0, 0], [170, 40], 20); });
        var cHips = makeController(comp, "C_Hips", P.hips, function (v) { rect(v, [0, 0], [150, 60], 12); });
        var cChest = makeController(comp, "C_Chest", P.chest, function (v) { rect(v, [0, 0], [110, 40], 10); });
        var cHead = makeController(comp, "C_Head", P.head, function (v) { ellipse(v, [0, 0], [pr.headR * 2.5, pr.headR * 2.5]); }, true);
        var cHandL = makeController(comp, "C_Hand_L", P.handL, function (v) { ellipse(v, [0, 0], [60, 60]); });
        var cHandR = makeController(comp, "C_Hand_R", P.handR, function (v) { ellipse(v, [0, 0], [60, 60]); });
        var cFootL = makeController(comp, "C_Foot_L", P.footL, function (v) { ellipse(v, [0, 0], [60, 60]); });
        var cFootR = makeController(comp, "C_Foot_R", P.footR, function (v) { ellipse(v, [0, 0], [60, 60]); });

        // --- hierarchy ---
        parentTo(cHips, cMaster, P.hips, P.master);
        parentTo(torso, cHips, P.torso, P.hips);
        parentTo(cChest, torso, P.chest, P.torso);
        parentTo(cHead, cChest, P.head, P.chest);
        parentTo(head, cHead, P.head, P.head);
        if (hat) parentTo(hat, cHead, P.head, P.head);
        parentTo(neck.layer, cChest, P.neckRoot, P.chest);
        parentTo(armL.layer, cChest, P.shoulderL, P.chest);
        parentTo(armR.layer, cChest, P.shoulderR, P.chest);
        parentTo(legL.layer, cHips, P.hipJointL, P.hips);
        parentTo(legR.layer, cHips, P.hipJointR, P.hips);
        parentTo(cHandL, cMaster, P.handL, P.master);
        parentTo(cHandR, cMaster, P.handR, P.master);
        parentTo(cFootL, cMaster, P.footL, P.master);
        parentTo(cFootR, cMaster, P.footR, P.master);
        parentTo(gloveL, cHandL, P.handL, P.handL);
        parentTo(gloveR, cHandR, P.handR, P.handR);
        parentTo(shoeL, cFootL, P.footL, P.footL);
        parentTo(shoeR, cFootR, P.footR, P.footR);

        // --- expressions (after controllers exist) ---
        var limbs = [legL, legR, armL, armR, neck];
        for (var li = 0; li < limbs.length; li++) {
            limbPath(limbs[li].layer).expression = hoseExpr(limbs[li].ctrlName);
        }

        // --- lock artwork ---
        var art = [legL.layer, legR.layer, armL.layer, armR.layer, neck.layer,
            torso, head, gloveL, gloveR, shoeL, shoeR];
        if (hat) art.push(hat);
        for (var ai = 0; ai < art.length; ai++) art[ai].locked = true;

        // stash genome on the master controller
        cMaster.comment = genomeToString(g);
        cMaster.locked = false;
        return { master: cMaster, palette: pal };
    }

    // ================================================ texture pass
    function applyTexture(comp, style, pal) {
        if (!style || style === "none") return;
        var adj = comp.layers.addSolid([1, 1, 1], "FX_Texture", comp.width, comp.height, 1);
        adj.adjustmentLayer = true;
        adj.moveToBeginning();
        var par = adj.property("ADBE Effect Parade");
        if (style === "grain") {
            var n = par.addProperty("ADBE Noise");
            n.property("ADBE Noise-0001").setValue(14);   // amount
            try { n.property("ADBE Noise-0002").setValue(1); } catch (e) {} // use color noise off
            adj.property("ADBE Transform Group").property("ADBE Opacity").setValue(45);
        } else if (style === "rough") {
            var r = par.addProperty("ADBE Roughen Edges");
            try { r.property("ADBE Roughen Edges-0002").setValue(6); } catch (e) {}   // border
            try { r.property("ADBE Roughen Edges-0005").setValue(3); } catch (e2) {}  // scale
        } else if (style === "boil") {
            var t = par.addProperty("ADBE Turbulent Displace");
            try { t.property("ADBE Turbulent Displace-0001").setValue(8); } catch (e) {}  // amount
            try { t.property("ADBE Turbulent Displace-0002").setValue(40); } catch (e2) {} // size
        }
    }

    // ================================================== API export
    // Exposed so panels / test harnesses can drive the builder without
    // re-evaluating this file per character (repeated evalFile of the
    // whole script corrupts AE object references).
    $.global.CB = {
        PRNG: PRNG,
        PALETTES: PALETTES,
        rollGenome: rollGenome,
        buildCharacter: buildCharacter,
        applyTexture: applyTexture,
        genomeToString: genomeToString,
        randomSeed: function () { return (Math.floor(Math.random() * 4294967295) >>> 0); }
    };

    // A harness sets CB_NOAUTORUN to reuse the API without an auto-build.
    if ($.global.CB_NOAUTORUN) return;

    // ==================================================== main
    app.beginUndoGroup("Character Builder: Generate");

    var seed = ($.global.CB_SEED != null) ? ($.global.CB_SEED >>> 0) : (Math.floor(Math.random() * 4294967295) >>> 0);
    var locks = {};
    if ($.global.CB_LOCKS) {
        var ls = String($.global.CB_LOCKS).split("|");
        for (var i = 0; i < ls.length; i++) if (ls[i]) locks[ls[i]] = true;
    }
    var origin = [0, 0];
    if ($.global.CB_ORIGIN) { var oo = String($.global.CB_ORIGIN).split(","); origin = [parseFloat(oo[0]), parseFloat(oo[1])]; }
    var texture = $.global.CB_TEXTURE ? String($.global.CB_TEXTURE) : "none";

    var g = rollGenome(seed, locks, null);

    // fresh comp per build (name carries the seed for reference)
    var comp = app.project.items.addComp("CB " + seed, 1080, 1080, 1, 5, 24);
    comp.bgColor = [0.93, 0.91, 0.86];
    buildCharacter(comp, g, origin);
    applyTexture(comp, texture, PALETTES[g.slots.palette]);
    comp.openInViewer();

    // sentinel for automation
    try {
        var rf = new File(Folder.temp.fsName + "/cb_build_result.txt");
        if (rf.open("w")) { rf.write("OK seed=" + seed + " palette=" + PALETTES[g.slots.palette].name + " layers=" + comp.numLayers); rf.close(); }
    } catch (eR) {}

    app.endUndoGroup();
    if (!$.global.CB_QUIET) {
        alert("Built character seed " + seed + " (" + PALETTES[g.slots.palette].name + ").");
    }

    })();
}
