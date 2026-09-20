/*
 * rig_spike.jsx — Character Builder Milestone 1: the rig spike.
 *
 * Builds ONE hard-coded rubber-hose character in a new comp and rigs it:
 *   - shape-layer body parts (no external assets)
 *   - custom-drawn controller layers (guide layers, red label)
 *   - bendy IK limbs: the limb path is written every frame by an
 *     expression (createPath) that reaches from the limb root toward
 *     its controller and bows outward when slack — see
 *     docs/rigging-notes.md for the contract.
 *
 * Run in AE: File > Scripts > Run Script File...  Then drag the red
 * hand/foot controllers around and watch the hoses bend.
 *
 * ES3 / ExtendScript only. Safe to run under jsc for a syntax check
 * (it exits early outside AE).
 */

(function () {

    if (typeof app === "undefined" || !app.project) {
        if (typeof print === "function") {
            print("rig_spike: not inside After Effects (syntax check only).");
        }
        return;
    }

    // ---------- palette (hard-coded for the spike) ----------

    var INK = [0.10, 0.09, 0.09];        // outline / limb color
    var BODY = [0.91, 0.72, 0.29];       // torso fill (mustard)
    var SKIN = [0.95, 0.89, 0.78];       // head fill (cream)
    var WHITE = [0.98, 0.97, 0.94];      // gloves
    var CTRL = [0.90, 0.25, 0.20];       // controller stroke (red)
    var BG = [0.93, 0.91, 0.86];

    var OUTLINE_W = 8;
    var ARM_W = 24;
    var LEG_W = 28;

    // ---------- layout (world positions at build time) ----------

    var P = {
        master: [540, 950],
        hips: [540, 680],
        torso: [540, 680],      // layer origin at hips so torso pivots there
        chest: [540, 480],
        head: [540, 345],
        shoulderL: [465, 480],
        shoulderR: [615, 480],
        handL: [350, 640],
        handR: [730, 640],
        hipJointL: [498, 700],
        hipJointR: [582, 700],
        footL: [470, 920],
        footR: [610, 920]
    };

    var ARM_LEN = 230;
    var LEG_LEN = 245;
    var NECK_LEN = 125;
    P.neckRoot = [540, 460];

    // ---------- shape-building helpers ----------

    function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }

    function newShapeLayer(comp, name) {
        var l = comp.layers.addShape();
        l.name = name;
        return l;
    }

    function addGroupVec(layer, name) {
        var g = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        g.name = name;
        return g.property("ADBE Vectors Group");
    }

    function addEllipse(vec, center, size) {
        var e = vec.addProperty("ADBE Vector Shape - Ellipse");
        e.property("ADBE Vector Ellipse Size").setValue(size);
        e.property("ADBE Vector Ellipse Position").setValue(center);
        return e;
    }

    function addRect(vec, center, size, roundness) {
        var r = vec.addProperty("ADBE Vector Shape - Rect");
        r.property("ADBE Vector Rect Size").setValue(size);
        r.property("ADBE Vector Rect Position").setValue(center);
        r.property("ADBE Vector Rect Roundness").setValue(roundness);
        return r;
    }

    function addPath(vec, vertices, inTangents, outTangents, closed) {
        var pgroup = vec.addProperty("ADBE Vector Shape - Group");
        var s = new Shape();
        s.vertices = vertices;
        s.inTangents = inTangents;
        s.outTangents = outTangents;
        s.closed = closed;
        pgroup.property("ADBE Vector Shape").setValue(s);
        return pgroup;
    }

    function addFill(vec, color) {
        var f = vec.addProperty("ADBE Vector Graphic - Fill");
        f.property("ADBE Vector Fill Color").setValue(color);
        return f;
    }

    function addStroke(vec, color, width) {
        var s = vec.addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(color);
        s.property("ADBE Vector Stroke Width").setValue(width);
        try {
            s.property("ADBE Vector Stroke Line Cap").setValue(2); // round
        } catch (eCap) {}
        return s;
    }

    function addSlider(layer, name, value) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property("ADBE Slider Control-0001").setValue(value);
        return fx;
    }

    function setPos(layer, world) {
        layer.property("ADBE Transform Group").property("ADBE Position").setValue(world);
    }

    // Parent, then re-express position relative to the parent. All parents
    // are unrotated/unscaled with anchor [0,0] at build time, so
    // relative = childWorld - parentWorld.
    function parentTo(child, parent, childWorld, parentWorld) {
        child.parent = parent;
        setPos(child, sub2(childWorld, parentWorld));
    }

    // noFill: controllers get a faint fill so their whole shape is a
    // click target (stroke-only shapes are only grabbable on the
    // outline pixels). Skip it for shapes that sit over artwork.
    function makeController(comp, name, world, drawFn, noFill) {
        var l = newShapeLayer(comp, name);
        setPos(l, world);
        var vec = addGroupVec(l, "Ctrl");
        drawFn(vec);
        addStroke(vec, CTRL, noFill ? 10 : 4);
        if (!noFill) {
            var fill = addFill(vec, CTRL);
            try {
                fill.property("ADBE Vector Fill Opacity").setValue(12);
            } catch (eOp) {}
        }
        l.guideLayer = true;
        l.label = 1; // red
        return l;
    }

    // ---------- the hose expression (see docs/rigging-notes.md) ----------

    function hoseExpression(ctrlName) {
        return "" +
            "// Rubber-hose IK: bow toward the controller, sag when slack.\n" +
            "function neg(v) { return [-v[0], -v[1]]; }\n" +
            "var C = thisComp.layer(\"" + ctrlName + "\");\n" +
            "var tgt = fromWorld(C.toWorld([0, 0]));\n" +
            "var L = effect(\"Limb Length\")(\"Slider\");\n" +
            "var dir = effect(\"Bend Dir\")(\"Slider\");\n" +
            "var d = length(tgt);\n" +
            "if (d < 0.001) { tgt = [0.001, 0]; d = 0.001; }\n" +
            "var u = tgt / d;\n" +
            "// Always reach the controller (hoses stretch — cartoon logic);\n" +
            "// sag only when there is slack. Keeps hands glued to their gloves.\n" +
            "var end = u * d;\n" +
            "var sag = 0.5 * Math.sqrt(Math.max(L * L - d * d, 0));\n" +
            "var n = [-u[1], u[0]];\n" +
            "var mid = end * 0.5 + n * (sag * dir);\n" +
            "var t0 = mid / 4;\n" +
            "var t1 = end / 4;\n" +
            "var t2 = (end - mid) / 4;\n" +
            "createPath([[0, 0], mid, end], [[0, 0], neg(t1), neg(t2)], [t0, t1, [0, 0]], false);";
    }

    // NOTE: the hose expression is NOT assigned here — AE validates
    // expressions on assignment, and the controller layers it references
    // don't exist yet. Returns {layer, path, ctrlName}; expressions are
    // hooked up after all layers are created.
    function makeLimb(comp, name, rootWorld, ctrlName, limbLen, bendDir, width) {
        var l = newShapeLayer(comp, name);
        setPos(l, rootWorld);
        var vec = addGroupVec(l, "Hose");
        // Placeholder straight path; the expression owns it from here on.
        addPath(vec, [[0, 0], [0, limbLen]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false);
        addStroke(vec, INK, width);
        addSlider(l, "Limb Length", limbLen);
        addSlider(l, "Bend Dir", bendDir);
        l.label = 8;
        return { layer: l, ctrlName: ctrlName };
    }

    // Property references go stale whenever the layer gains properties
    // (AE scripting gotcha), so always resolve the hose path fresh.
    function limbPathProp(l) {
        return l.property("ADBE Root Vectors Group").property("Hose")
            .property("ADBE Vectors Group").property(1)
            .property("ADBE Vector Shape");
    }

    // ---------- build ----------

    app.beginUndoGroup("Character Builder: Rig Spike");

    // Remove leftovers from earlier (possibly failed) spike runs.
    for (var ii = app.project.numItems; ii >= 1; ii--) {
        var existing = app.project.item(ii);
        if (existing instanceof CompItem && existing.name === "CB Rig Spike") {
            existing.remove();
        }
    }

    var comp = app.project.items.addComp("CB Rig Spike", 1080, 1080, 1, 12, 24);
    comp.bgColor = BG;

    // Created bottom-up: later layers stack on top.

    var legL = makeLimb(comp, "Leg_L", P.hipJointL, "C_Foot_L", LEG_LEN, 1, LEG_W);
    var legR = makeLimb(comp, "Leg_R", P.hipJointR, "C_Foot_R", LEG_LEN, -1, LEG_W);

    var shoeL = newShapeLayer(comp, "Shoe_L");
    setPos(shoeL, P.footL);
    var shoeLVec = addGroupVec(shoeL, "Shoe");
    addEllipse(shoeLVec, [-14, -14], [95, 48]);
    addFill(shoeLVec, INK);
    addStroke(shoeLVec, INK, OUTLINE_W);

    var shoeR = newShapeLayer(comp, "Shoe_R");
    setPos(shoeR, P.footR);
    var shoeRVec = addGroupVec(shoeR, "Shoe");
    addEllipse(shoeRVec, [14, -14], [95, 48]);
    addFill(shoeRVec, INK);
    addStroke(shoeRVec, INK, OUTLINE_W);

    // Neck hose: drawn behind torso and head, reaches for C_Head so
    // pulling the head stretches a cartoon neck.
    var neck = makeLimb(comp, "Neck", P.neckRoot, "C_Head", NECK_LEN, 1, 22);

    var torso = newShapeLayer(comp, "Torso");
    setPos(torso, P.torso);
    var torsoVec = addGroupVec(torso, "Body");
    addEllipse(torsoVec, [0, -110], [200, 270]);
    addFill(torsoVec, BODY);
    addStroke(torsoVec, INK, OUTLINE_W);

    var head = newShapeLayer(comp, "Head");
    setPos(head, P.head);
    var faceVec = addGroupVec(head, "Face");
    // mouth: gentle smile
    addPath(faceVec,
        [[-30, 42], [0, 54], [30, 42]],
        [[0, 0], [-10, 0], [-8, 4]],
        [[8, 4], [10, 0], [0, 0]],
        false);
    addStroke(faceVec, INK, 6);
    var eyesVec = addGroupVec(head, "Eyes");
    addEllipse(eyesVec, [-34, -15], [26, 42]);
    addEllipse(eyesVec, [34, -15], [26, 42]);
    addFill(eyesVec, INK);
    var skullVec = addGroupVec(head, "Skull");
    addEllipse(skullVec, [0, 0], [190, 190]);
    addFill(skullVec, SKIN);
    addStroke(skullVec, INK, OUTLINE_W);

    var armL = makeLimb(comp, "Arm_L", P.shoulderL, "C_Hand_L", ARM_LEN, 1, ARM_W);
    var armR = makeLimb(comp, "Arm_R", P.shoulderR, "C_Hand_R", ARM_LEN, -1, ARM_W);

    var gloveL = newShapeLayer(comp, "Glove_L");
    setPos(gloveL, P.handL);
    var gloveLVec = addGroupVec(gloveL, "Glove");
    addEllipse(gloveLVec, [0, 0], [64, 64]);
    addFill(gloveLVec, WHITE);
    addStroke(gloveLVec, INK, OUTLINE_W);

    var gloveR = newShapeLayer(comp, "Glove_R");
    setPos(gloveR, P.handR);
    var gloveRVec = addGroupVec(gloveR, "Glove");
    addEllipse(gloveRVec, [0, 0], [64, 64]);
    addFill(gloveRVec, WHITE);
    addStroke(gloveRVec, INK, OUTLINE_W);

    // Controllers (top of the stack).

    var cMaster = makeController(comp, "C_Master", P.master, function (vec) {
        addRect(vec, [0, 0], [170, 40], 20);
    });
    var cHips = makeController(comp, "C_Hips", P.hips, function (vec) {
        addRect(vec, [0, 0], [150, 60], 12);
    });
    var cChest = makeController(comp, "C_Chest", P.chest, function (vec) {
        addRect(vec, [0, 0], [110, 40], 10);
    });
    var cHead = makeController(comp, "C_Head", P.head, function (vec) {
        // Ring just outside the head: grab-and-rotate for tilt,
        // drag for cartoon neck-stretch.
        addEllipse(vec, [0, 0], [240, 240]);
    }, true);
    var cHandL = makeController(comp, "C_Hand_L", P.handL, function (vec) {
        addEllipse(vec, [0, 0], [60, 60]);
    });
    var cHandR = makeController(comp, "C_Hand_R", P.handR, function (vec) {
        addEllipse(vec, [0, 0], [60, 60]);
    });
    var cFootL = makeController(comp, "C_Foot_L", P.footL, function (vec) {
        addEllipse(vec, [0, 0], [60, 60]);
    });
    var cFootR = makeController(comp, "C_Foot_R", P.footR, function (vec) {
        addEllipse(vec, [0, 0], [60, 60]);
    });

    // ---------- hierarchy ----------
    //
    // C_Master ─ C_Hips ─ Torso ─ C_Chest ─ { Head, Arm_L, Arm_R }
    //                   └ { Leg_L, Leg_R }
    // C_Master ─ { C_Hand_L/R, C_Foot_L/R } ─ { gloves, shoes }

    parentTo(cHips, cMaster, P.hips, P.master);
    parentTo(torso, cHips, P.torso, P.hips);
    parentTo(cChest, torso, P.chest, P.torso);
    parentTo(cHead, cChest, P.head, P.chest);
    parentTo(head, cHead, P.head, P.head);
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

    // Hook up the hose expressions now that the controllers exist.
    var limbs = [legL, legR, armL, armR, neck];
    for (var li = 0; li < limbs.length; li++) {
        limbPathProp(limbs[li].layer).expression = hoseExpression(limbs[li].ctrlName);
    }

    // Lock all artwork so a stray click in the viewer can only grab a
    // controller. (Must happen after expressions are assigned.)
    var art = [legL.layer, legR.layer, armL.layer, armR.layer,
        neck.layer, torso, head, gloveL, gloveR, shoeL, shoeR];
    for (var ai = 0; ai < art.length; ai++) {
        art[ai].locked = true;
    }

    comp.openInViewer();
    app.endUndoGroup();

    // Result sentinel so an automated runner can confirm the build
    // without waiting on the alert below. ($.fileName is unreliable
    // under AppleScript DoScriptFile, so use the temp folder.)
    try {
        var resFile = new File(Folder.temp.fsName + "/cb_rig_spike_result.txt");
        resFile.open("w");
        resFile.write("OK layers=" + comp.numLayers + " " + (new Date()).toString());
        resFile.close();
    } catch (eRes) {}

    // Automation can pre-set $.global.CB_QUIET = 1 (via DoScript) to
    // suppress the modal so DoScriptFile returns immediately.
    if (!$.global.CB_QUIET) {
        alert("Rig spike built.\n\nDrag the red hand/foot controllers — the hoses should bend.\nC_Hips and C_Chest rotate the body; C_Master moves everything.");
    }

})();
