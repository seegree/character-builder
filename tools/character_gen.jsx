/*
 * character_gen.jsx — the assembled generator. Loads the compiled
 * `short_run_parts` design pack (tools/parts_data/*.jsx, produced by
 * tools/build_parts.py) and composes a full, textured, rig-ready
 * rubber-hose character from a seeded genome.
 *
 * Run in AE. Globals:
 *   $.global.CB_SEED    force a seed
 *   $.global.CB_QUIET   1 to suppress the alert
 *   $.global.CB_NOAUTO  1 to load the API only (for a harness)
 * The API is exposed on $.global.CGEN = { PRNG, roll, build, ... }.
 * ES3 / ExtendScript.
 */
if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") print("character_gen: syntax check only.");
} else {
(function () {
    // ---------- load compiled part data ----------
    var HERE = File($.fileName).parent.fsName;
    var DATA = HERE + "/parts_data/";
    $.evalFile(DATA + "eyes.jsx"); $.evalFile(DATA + "brows.jsx"); $.evalFile(DATA + "mouths.jsx");
    $.evalFile(DATA + "noses.jsx"); $.evalFile(DATA + "ears.jsx"); $.evalFile(DATA + "glasses.jsx");
    $.evalFile(DATA + "facial_hair.jsx"); $.evalFile(DATA + "accessories.jsx"); $.evalFile(DATA + "shoes.jsx");
    $.evalFile(DATA + "heads.jsx"); $.evalFile(DATA + "hair.jsx"); $.evalFile(DATA + "bodies.jsx");
    $.evalFile(DATA + "tops.jsx"); $.evalFile(DATA + "bottoms.jsx");
    $.evalFile(DATA + "palettes.jsx"); $.evalFile(DATA + "finish.jsx"); $.evalFile(DATA + "skeleton.jsx");

    // ---------- primitives ----------
    // AE gives a fresh shape layer a Position default of the comp's center,
    // not [0,0]. Most of this file bakes absolute stage/head-local
    // coordinates straight into vertex data (via drawPart's dx/dy) and
    // expects the layer transform itself to contribute no additional
    // offset, so zero it here; callers that DO want a transform offset
    // (limbs, shoes, controllers, Eyes) call posL() afterward anyway.
    function layer(c,n){ var l=c.layers.addShape(); l.name=n; posL(l,[0,0]); return l; }
    function grp(l,n){ var g=l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name=n; return g.property("ADBE Vectors Group"); }
    function ell(v,c,s){ var e=v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue(s); e.property("ADBE Vector Ellipse Position").setValue(c); return e; }
    function nz(n){var a=[];for(var i=0;i<n;i++)a.push([0,0]);return a;}
    function pth(v,ve,i,o,c){ var pg=v.addProperty("ADBE Vector Shape - Group"); var s=new Shape(); s.vertices=ve; s.inTangents=i||nz(ve.length); s.outTangents=o||nz(ve.length); s.closed=(c!==false); pg.property("ADBE Vector Shape").setValue(s); return pg; }
    function fill(v,c){ var f=v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(c); return f; }
    function strk(v,c,w){ var s=v.addProperty("ADBE Vector Graphic - Stroke"); s.property("ADBE Vector Stroke Color").setValue(c); s.property("ADBE Vector Stroke Width").setValue(w); try{s.property("ADBE Vector Stroke Line Cap").setValue(2);}catch(e){} try{s.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e2){} return s; }
    function posL(l,p){ l.property("ADBE Transform Group").property("ADBE Position").setValue(p); }
    function opL(l,v){ l.property("ADBE Transform Group").property("ADBE Opacity").setValue(v); }
    function addTrim(g,a,b){ var t=g.addProperty("ADBE Vector Filter - Trim"); t.property("ADBE Vector Trim Start").setValue(a*100); t.property("ADBE Vector Trim End").setValue(b*100); }

    // ---------- PRNG ----------
    function imul(a,b){ a=a>>>0;b=b>>>0; var ah=(a>>>16)&0xffff,al=a&0xffff,bh=(b>>>16)&0xffff,bl=b&0xffff; return ((al*bl)+((((ah*bl+al*bh)&0xffff)<<16)>>>0))>>>0; }
    function hash32(x){ x=x>>>0; x^=x>>>16; x=imul(x,0x7feb352d); x^=x>>>15; x=imul(x,0x846ca68b); x^=x>>>16; return x>>>0; }
    function PRNG(seed){ this.s=hash32((seed>>>0)||1)||1; }
    PRNG.prototype.next=function(){ var x=this.s; x^=x<<13;x=x>>>0; x^=x>>17; x^=x<<5;x=x>>>0; this.s=x; return (x>>>0)/4294967296; };
    PRNG.prototype.rng=function(a,b){ return a+(b-a)*this.next(); };
    PRNG.prototype.pick=function(a){ return a[Math.floor(this.next()*a.length)]; };
    PRNG.prototype.chance=function(p){ return this.next()<p; };

    // ---------- color ----------
    function hexToRGB(hex){ hex=hex.replace("#",""); return [parseInt(hex.substr(0,2),16)/255, parseInt(hex.substr(2,2),16)/255, parseInt(hex.substr(4,2),16)/255]; }
    function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
    function mul(c,f){ return [c[0]*f,c[1]*f,c[2]*f]; }

    function resolveRoles(paletteObj, skinHex){
        var roles={};
        for(var k in paletteObj.roles){ if(paletteObj.roles.hasOwnProperty(k)) roles[k]=hexToRGB(paletteObj.roles[k]); }
        roles.stock=hexToRGB(PALETTE_DATA.stock);
        roles.skin=hexToRGB(skinHex);
        roles.blush=mix(roles.skin, roles.accent, 0.42);
        roles.lens=mix(roles.ink, roles.bg, 0.15);
        return roles;
    }

    // ---------- generic part drawing ----------
    // ops: array of {shape:[{v,i,o,c}...], fillRole, knockout, strokeRole, strokeWidth, cap, join}
    // already in AE creation order (index 0 = frontmost).
    function drawPart(L, ops, roles, dx, dy, sx, sy){
        dx=dx||0; dy=dy||0; sx=(sx==null)?1:sx; sy=(sy==null)?1:sy;
        for(var i=0;i<ops.length;i++){
            var op=ops[i], v=grp(L,"p"+i);
            for(var s=0;s<op.shape.length;s++){
                var sp=op.shape[s], n=sp.v.length, verts=[],ins=[],outs=[];
                for(var k=0;k<n;k++){
                    verts.push([dx+sp.v[k][0]*sx, dy+sp.v[k][1]*sy]);
                    outs.push([sp.o[k][0]*sx, sp.o[k][1]*sy]);
                    ins.push([sp.i[k][0]*sx, sp.i[k][1]*sy]);
                }
                pth(v, verts, ins, outs, sp.c);
            }
            if(op.fillRole){ fill(v, op.knockout ? roles.stock : roles[op.fillRole]); }
            if(op.strokeRole){ strk(v, roles[op.strokeRole], op.strokeWidth*((Math.abs(sx)+Math.abs(sy))/2)); }
        }
    }

    // ---------- stage frame ----------
    var STAGE_X=500, STAGE_Y=480; // world = [STAGE_X+x, STAGE_Y+y]
    function W(x,y){ return [STAGE_X+x, STAGE_Y+y]; }
    function bodyMeta(id){ for(var i=0;i<SKELETON.bodies.length;i++) if(SKELETON.bodies[i].id===id) return SKELETON.bodies[i]; }
    function headMeta(id){ for(var i=0;i<SKELETON.heads.length;i++) if(SKELETON.heads[i].id===id) return SKELETON.heads[i]; }

    // ---------- garment retargeting (authored against B1; scaled onto the chosen body) ----------
    function regionScale(py, b1, tgt){
        var hipY=b1.anchors.hip[1];
        if(py<=hipY){
            return { sx:tgt.params.sw/b1.params.sw,
                      sy:(tgt.anchors.hip[1]-tgt.anchors.neck[1])/(b1.anchors.hip[1]-b1.anchors.neck[1]),
                      ax:0, ay:b1.anchors.neck[1], tax:0, tay:tgt.anchors.neck[1] };
        }
        return { sx:tgt.params.hw/b1.params.hw,
                  sy:(tgt.anchors.ankle[1]-tgt.anchors.hip[1])/(b1.anchors.ankle[1]-b1.anchors.hip[1]),
                  ax:0, ay:b1.anchors.hip[1], tax:0, tay:tgt.anchors.hip[1] };
    }
    function retargetOps(ops, b1, tgt){
        if(!ops || tgt.id===b1.id) return ops;
        var out=[];
        for(var i=0;i<ops.length;i++){
            var op=ops[i], nop={fillRole:op.fillRole, knockout:op.knockout, strokeRole:op.strokeRole, strokeWidth:op.strokeWidth, cap:op.cap, join:op.join, shape:[]};
            for(var s=0;s<op.shape.length;s++){
                var sp=op.shape[s], nv=[],no=[],ni=[];
                for(var k=0;k<sp.v.length;k++){
                    var r=regionScale(sp.v[k][1], b1, tgt);
                    nv.push([r.tax+(sp.v[k][0]-r.ax)*r.sx, r.tay+(sp.v[k][1]-r.ay)*r.sy]);
                    no.push([sp.o[k][0]*r.sx, sp.o[k][1]*r.sy]);
                    ni.push([sp.i[k][0]*r.sx, sp.i[k][1]*r.sy]);
                }
                nop.shape.push({v:nv,o:no,i:ni,c:sp.c});
            }
            out.push(nop);
        }
        return out;
    }

    // ---------- garment lookup ----------
    function findGarment(list, id){ for(var i=0;i<list.length;i++) if(list[i].id===id) return list[i]; return null; }
    var EXTRA_FRONT_ORDER=["hoodbits","collar","hood","vest","hemband","bib","stripes","skirt","flare"];
    function appendOps(dst, ops){ if(ops) for(var i=0;i<ops.length;i++) dst.push(ops[i]); }

    var SLEEVE_LEN={T1_tee:0.55,T2_tank:0.12,T3_turtleneck:0.92,T4_polo:0.55,T5_hoodie:0.9,T6_vest:0.05,T7_dress:0.55,T8_jersey:0.55};
    var PANT_LEN={U1_shorts:0.42,U2_trousers:0.95,U3_knickers:0.65,U4_a_line_skirt:1.0,U5_dungarees:0.95,U6_flares:0.98};

    function assembleGarments(bodyId, topId, bottomId){
        var b1=bodyMeta("B1"), tgt=bodyMeta(bodyId);
        var baseBody=BODIES[bodyId];
        var topG=findGarment(TOPS, topId), botG=findGarment(BOTTOMS, bottomId);

        var neckline = baseBody.neckline;
        if(topG.overrides.neckline==="omit") neckline=null;
        else if(topG.overrides.neckline) neckline=retargetOps(topG.overrides.neckline, b1, tgt);

        var topOps = topG.overrides.top ? retargetOps(topG.overrides.top, b1, tgt) : baseBody.top;
        var torsoOps = topG.overrides.torso ? retargetOps(topG.overrides.torso, b1, tgt) : baseBody.torso;

        var pelvisOps = baseBody.pelvis, pelvisOmitted=false;
        if(botG.overrides.pelvis==="omit"){ pelvisOps=null; pelvisOmitted=true; }
        else if(botG.overrides.pelvis){ pelvisOps=retargetOps(botG.overrides.pelvis, b1, tgt); }

        var extras=[];
        var e; for(e=0;e<topG.extras.length;e++) extras.push({suffix:topG.extras[e].suffix, ops:retargetOps(topG.extras[e].ops, b1, tgt)});
        for(e=0;e<botG.extras.length;e++) extras.push({suffix:botG.extras[e].suffix, ops:retargetOps(botG.extras[e].ops, b1, tgt)});

        var order=[];
        if(neckline) appendOps(order, neckline);
        var k; for(k=0;k<EXTRA_FRONT_ORDER.length;k++){ var suf=EXTRA_FRONT_ORDER[k];
            for(e=0;e<extras.length;e++) if(extras[e].suffix===suf) appendOps(order, extras[e].ops); }
        appendOps(order, topOps);
        appendOps(order, torsoOps);
        if(pelvisOps) appendOps(order, pelvisOps);

        var isSkirt = (bottomId==="U4_a_line_skirt");
        return { ops:order, isSkirt:isSkirt, pelvisOmitted:pelvisOmitted,
                 sleeveFrac: (SLEEVE_LEN[topId]!=null)?SLEEVE_LEN[topId]:0.55,
                 pantFrac: (PANT_LEN[bottomId]!=null)?PANT_LEN[bottomId]:0.9 };
    }

    // ---------- auto-blink ----------
    function blinkScaleExpr(){
        return "" +
        "var base=2.6, dur=0.12;\n" +
        "seedRandom(7,true);\n" +
        "var t0=0, per;\n" +
        "while(true){ per=base+(random()-0.5)*1.4; if(t0+per>time){ break; } t0+=per; }\n" +
        "var tt=time-t0;\n" +
        "var amt=(tt>=0 && tt<dur)? Math.sin(Math.PI*tt/dur):0;\n" +
        "var s=1-amt*0.92;\n" +
        "[value[0], s*100];";
    }

    // ---------- finish/texture (partial: tooth grain + wobble; registration/
    // crescent/dropout from finish.json are not yet implemented) ----------
    function applyFinish(comp, presetName, decorLayers){
        var preset=FINISH_DATA.presets[presetName];
        if(!preset || preset.flat) return;
        var tex=comp.layers.addSolid([0.5,0.5,0.5],"FX_Tooth",comp.width,comp.height,1);
        tex.adjustmentLayer=true; tex.moveToBeginning();
        var noise=tex.property("ADBE Effect Parade").addProperty("ADBE Noise");
        try{ noise.property("ADBE Noise-0001").setValue(Math.min(100, 14*preset.tooth)); }catch(e){}
        opL(tex, Math.round(preset.shade_op*100));
        tex.blendingMode=BlendingMode.MULTIPLY;
        tex.comment="CBART master";
        for(var i=0;i<decorLayers.length;i++){
            try{ decorLayers[i].property("ADBE Transform Group").property("ADBE Position").expression = "wiggle(0.6,"+preset.wob+")"; }catch(e){}
        }
    }

    // ---------- genome ----------
    var SKIN_IDS=[]; for(var si=0;si<PALETTE_DATA.skin_ramp.length;si++) SKIN_IDS.push(PALETTE_DATA.skin_ramp[si].id);
    function skinHexById(id){ for(var i=0;i<PALETTE_DATA.skin_ramp.length;i++) if(PALETTE_DATA.skin_ramp[i].id===id) return PALETTE_DATA.skin_ramp[i].hex; }
    var PAL_IDS=[]; for(var pj=0;pj<PALETTE_DATA.palettes.length;pj++) PAL_IDS.push(PALETTE_DATA.palettes[pj].id);
    function paletteById(id){ for(var i=0;i<PALETTE_DATA.palettes.length;i++) if(PALETTE_DATA.palettes[i].id===id) return PALETTE_DATA.palettes[i]; }

    var HEAD_IDS=[]; for(var h=0;h<SKELETON.heads.length;h++) HEAD_IDS.push(SKELETON.heads[h].id);
    var BODY_IDS=[]; for(var bd=0;bd<SKELETON.bodies.length;bd++) BODY_IDS.push(SKELETON.bodies[bd].id);
    function keysOf(obj){ var a=[]; for(var k in obj) if(obj.hasOwnProperty(k)) a.push(k); return a; }
    var HAIR_IDS=keysOf(HAIR);
    var EYES_IDS=keysOf(EYES);
    var BROWS_IDS=keysOf(BROWS);
    var NOSES_IDS=keysOf(NOSES);
    var MOUTHS_IDS=keysOf(MOUTHS);
    var EARS_IDS=keysOf(EARS);
    var TOP_IDS_G=[]; for(var ti=0;ti<TOPS.length;ti++) TOP_IDS_G.push(TOPS[ti].id);
    var BOTTOM_IDS_G=[]; for(var bi=0;bi<BOTTOMS.length;bi++) BOTTOM_IDS_G.push(BOTTOMS[bi].id);
    var SHOES_IDS=keysOf(SHOES);
    var FACIAL_IDS=["None"].concat(keysOf(FACIAL_HAIR));
    var GLASSES_IDS=["None"].concat(keysOf(GLASSES));
    var ACCESSORY_IDS=["None"].concat(keysOf(ACCESSORIES));

    var SLOTS_DEF=[
        {key:"palette",    label:"Palette", vals:PAL_IDS},
        {key:"head",       label:"Head",    vals:HEAD_IDS},
        {key:"body",       label:"Body",    vals:BODY_IDS},
        {key:"hair",       label:"Hair",    vals:HAIR_IDS},
        {key:"ears",       label:"Ears",    vals:EARS_IDS},
        {key:"eyes",       label:"Eyes",    vals:EYES_IDS},
        {key:"brows",      label:"Brows",   vals:BROWS_IDS},
        {key:"nose",       label:"Nose",    vals:NOSES_IDS},
        {key:"mouth",      label:"Mouth",   vals:MOUTHS_IDS},
        {key:"facial",     label:"Facial",  vals:FACIAL_IDS},
        {key:"glasses",    label:"Glasses", vals:GLASSES_IDS},
        {key:"top",        label:"Top",     vals:TOP_IDS_G},
        {key:"bottom",     label:"Bottom",  vals:BOTTOM_IDS_G},
        {key:"shoes",      label:"Shoes",   vals:SHOES_IDS},
        {key:"accessory",  label:"Accy",    vals:ACCESSORY_IDS}
    ];
    function slotDef(k){ for(var i=0;i<SLOTS_DEF.length;i++) if(SLOTS_DEF[i].key===k) return SLOTS_DEF[i]; return null; }

    function roll(seed){
        var r=new PRNG(seed), g={seed:seed};
        g.palette=r.pick(PAL_IDS); g.skin=r.pick(SKIN_IDS);
        g.head=r.pick(HEAD_IDS); g.body=r.pick(BODY_IDS);
        g.hair=r.pick(HAIR_IDS); g.ears=r.pick(EARS_IDS);
        g.eyes=r.pick(EYES_IDS); g.brows=r.pick(BROWS_IDS); g.nose=r.pick(NOSES_IDS); g.mouth=r.pick(MOUTHS_IDS);
        g.facial = r.chance(0.7) ? "None" : r.pick(FACIAL_IDS.slice(1));
        g.glasses = r.chance(0.55) ? "None" : r.pick(GLASSES_IDS.slice(1));
        g.top=r.pick(TOP_IDS_G); g.bottom=r.pick(BOTTOM_IDS_G); g.shoes=r.pick(SHOES_IDS);
        g.accessory = r.chance(0.55) ? "None" : r.pick(ACCESSORY_IDS.slice(1));
        return g;
    }

    // ---------- build ----------
    function build(comp, g){
        var pal=paletteById(g.palette);
        var roles=resolveRoles(pal, skinHexById(g.skin));
        comp.bgColor=roles.bg;

        var head=headMeta(g.head), bodyM=bodyMeta(g.body);
        var headCY=SKELETON.chin_y - head.ry; // head-local origin's world Y (stage frame)
        var HW=W(0, headCY);

        var garm=assembleGarments(g.body, g.top, g.bottom);
        var decorLayers=[];

        // ground shadow
        var sh=layer(comp,"Shadow"); var shv=grp(sh,"g"); ell(shv,[0,0],[bodyM.params.hw*3.2, 40]); fill(shv,mul(roles.bg,0.86)); posL(sh, W(0, bodyM.anchors.ground+18)); sh.comment="CBART master";

        // hair back
        var hairPart=HAIR[g.hair];
        if(hairPart.back.length){ var hb=layer(comp,"HairBack"); drawPart(hb, hairPart.back, roles, HW[0], HW[1]); hb.comment="CBART head"; decorLayers.push(hb); }

        // legs: joint-anchored hose (hip -> ankle). Skin runs the full leg;
        // the pant is a trimmed stroke on top (0..pantFrac), so shorts /
        // knickers leave bare lower leg the same way sleeves leave bare
        // forearm. Skirts skip the pant stroke entirely (bare leg to the
        // ankle, skirt fabric itself is drawn as a Body-layer extra).
        function legLimb(nm, dir){
            var l=layer(comp,nm);
            var len=bodyM.anchors.ankle[1]-bodyM.anchors.hip[1];
            var tipX=(bodyM.anchors.ankle[0]-bodyM.anchors.hip[0])*dir;
            function legPath(v){ pth(v,[[0,0],[tipX,len]],null,null,false); }
            if(!garm.isSkirt){
                var pv=grp(l,"pant"); legPath(pv); addTrim(pv,0,garm.pantFrac);
                strk(pv, roles.bottom, bodyM.params.lw+4); strk(pv, roles.ink, bodyM.params.lw+4+8);
            }
            var sk=grp(l,"skin"); legPath(sk); strk(sk, roles.skin, bodyM.params.lw); strk(sk, roles.ink, bodyM.params.lw+8);
            l.comment="CBLIMB tip="+tipX+","+len+" bend="+(dir<0?1:-1);
            posL(l, W(dir*bodyM.anchors.hip[0], bodyM.anchors.hip[1]));
        }
        legLimb("CB_Leg_L",-1); legLimb("CB_Leg_R",1);

        // shoes (ankle-local; authored for the left foot, mirrored for the right)
        function shoe(nm,dir,x,y){ var s=layer(comp,nm); drawPart(s, SHOES[g.shoes], roles, 0,0, dir,1); posL(s, W(x,y)); }
        shoe("CB_Foot_L",1, -bodyM.anchors.ankle[0], bodyM.anchors.ankle[1]);
        shoe("CB_Foot_R",-1, bodyM.anchors.ankle[0], bodyM.anchors.ankle[1]);

        // body + garment silhouette (single layer, correct internal z-order)
        var bodyL=layer(comp,"Body"); drawPart(bodyL, garm.ops, roles, STAGE_X, STAGE_Y); bodyL.comment="CBART chest";

        // arms: skin arm with sleeve+cuff trimmed over it (Trim Paths)
        function arm(nm,dir){
            var l=layer(comp,nm);
            var tipX=(bodyM.anchors.wrist[0]-bodyM.anchors.shoulder[0])*dir;
            var tipY=bodyM.anchors.wrist[1]-bodyM.anchors.shoulder[1];
            var sl=garm.sleeveFrac;
            function armPath(v){ pth(v,[[0,0],[tipX,tipY]],null,null,false); }
            var cf=grp(l,"cuff"); armPath(cf); addTrim(cf, Math.max(0,sl-0.045), sl); strk(cf, mul(roles.top,0.70), bodyM.params.aw*1.9);
            var sv=grp(l,"sleeve"); armPath(sv); addTrim(sv,0,sl); strk(sv, roles.top, bodyM.params.aw*1.7); strk(sv, roles.ink, bodyM.params.aw*1.7+8);
            var sk=grp(l,"skin"); armPath(sk); strk(sk, roles.skin, bodyM.params.aw); strk(sk, roles.ink, bodyM.params.aw+8);
            l.comment="CBLIMB tip="+tipX+","+tipY+" bend="+(dir<0?1:-1);
            posL(l, W(dir*bodyM.anchors.shoulder[0], bodyM.anchors.shoulder[1]));
        }
        arm("CB_Arm_L",-1); arm("CB_Arm_R",1);

        // hands
        function hand(nm,dir){ var h=layer(comp,nm); var v=grp(h,"g"); ell(v,[0,0],[bodyM.params.aw*1.9, bodyM.params.aw*2.3]); fill(v,roles.skin); strk(v,roles.ink,3.6);
            posL(h, W(dir*bodyM.anchors.wrist[0], bodyM.anchors.wrist[1])); }
        hand("CB_Hand_L",-1); hand("CB_Hand_R",1);

        // head
        var hd=layer(comp,"Head"); drawPart(hd, HEADS[g.head], roles, HW[0], HW[1]); hd.comment="CBART head";
        var er=layer(comp,"Ears"); drawPart(er, EARS[g.ears], roles, HW[0], HW[1]); er.comment="CBART head";
        if(g.facial!=="None"){ var fh=layer(comp,"Facial"); drawPart(fh, FACIAL_HAIR[g.facial], roles, HW[0], HW[1]); fh.comment="CBART head"; }
        var no=layer(comp,"Nose"); drawPart(no, NOSES[g.nose], roles, HW[0], HW[1]); no.comment="CBART head";
        var mo=layer(comp,"Mouth"); drawPart(mo, MOUTHS[g.mouth], roles, HW[0], HW[1]); mo.comment="CBART head";
        var ey=layer(comp,"Eyes"); drawPart(ey, EYES[g.eyes], roles, 0,0);
        ey.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0,0]);
        posL(ey, HW); ey.comment="CBART head";
        if(g.blink){ ey.property("ADBE Transform Group").property("ADBE Scale").expression=blinkScaleExpr(); }
        var br=layer(comp,"Brows"); drawPart(br, BROWS[g.brows], roles, HW[0], HW[1]); br.comment="CBART head";
        if(g.glasses!=="None"){ var gl=layer(comp,"Glasses"); drawPart(gl, GLASSES[g.glasses], roles, HW[0], HW[1]); gl.comment="CBART head"; }
        if(hairPart.front.length){ var hf=layer(comp,"HairFront"); drawPart(hf, hairPart.front, roles, HW[0], HW[1]); hf.comment="CBART head"; decorLayers.push(hf); }
        if(g.accessory!=="None"){ var ac=layer(comp,"Accessory"); drawPart(ac, ACCESSORIES[g.accessory], roles, HW[0], HW[1]); ac.comment="CBART head"; decorLayers.push(ac); }

        // guide controllers (grabbable, red)
        function ctrlLayer(name,world,drawFn,noFill,rr){
            var l=layer(comp,name); var v=grp(l,"Ctrl"); drawFn(v);
            strk(v,[0.90,0.25,0.20], noFill?9:4);
            if(!noFill){ var f=fill(v,[0.90,0.25,0.20]); try{ f.property("ADBE Vector Fill Opacity").setValue(12); }catch(e){} }
            l.guideLayer=true; l.label=1; posL(l,world); return l;
        }
        ctrlLayer("CB_Hips", W(0,bodyM.anchors.hip[1]), function(v){ var w=bodyM.params.hw*2.2; pth(v,[[-w/2,-14],[w/2,-14],[w/2,14],[-w/2,14]],null,null,true); });
        ctrlLayer("CB_Chest", W(0,(bodyM.anchors.neck[1]+bodyM.anchors.hip[1])/2), function(v){ var w=bodyM.params.sw*1.8; pth(v,[[-w/2,-14],[w/2,-14],[w/2,14],[-w/2,14]],null,null,true); });
        ctrlLayer("CB_Head", W(0,bodyM.anchors.neck[1]), function(v){ ell(v,[0,0],[26,26]); });

        // finish / texture pass (tooth grain + wobble)
        if(g.finish && g.finish!=="OFF") applyFinish(comp, g.finish, decorLayers);
    }

    // ---------- choice/slot API (drives the panel) ----------
    function choiceToG(ch, opts){
        opts=opts||{};
        var g={seed:0, skin: SKIN_IDS[0]};
        for(var i=0;i<SLOTS_DEF.length;i++){ var s=SLOTS_DEF[i]; g[s.key]=s.vals[ch[s.key]]; }
        g.finish = opts.finish || "HOUSE";
        g.blink=(opts.blink===true);
        return g;
    }
    function randomChoice(rng){
        var ch={}; for(var i=0;i<SLOTS_DEF.length;i++){ var s=SLOTS_DEF[i]; ch[s.key]=Math.floor(rng.next()*s.vals.length); } return ch;
    }
    function rerollChoice(base, locked, rng){
        var ch={}; for(var i=0;i<SLOTS_DEF.length;i++){ var s=SLOTS_DEF[i];
            ch[s.key]=(locked && locked[s.key]) ? base[s.key] : Math.floor(rng.next()*s.vals.length); }
        return ch;
    }
    function buildChoice(comp, ch, opts){ build(comp, choiceToG(ch, opts)); }

    // ---------- API + main ----------
    $.global.CGEN={ PRNG:PRNG, roll:roll, build:build,
        SLOTS:SLOTS_DEF, choiceToG:choiceToG, randomChoice:randomChoice,
        rerollChoice:rerollChoice, buildChoice:buildChoice,
        FINISH_PRESETS:keysOf(FINISH_DATA.presets) };
    if($.global.CB_NOAUTO) return;

    app.beginUndoGroup("Character Gen");
    var seed=($.global.CB_SEED!=null)?($.global.CB_SEED>>>0):(Math.floor(Math.random()*4294967295)>>>0);
    var g=roll(seed); g.finish="HOUSE";
    var comp=app.project.items.addComp("CGEN "+seed,1000,1400,1,5,24);
    build(comp,g);
    comp.openInViewer();
    try{ var rf=new File(Folder.temp.fsName+"/cgen_result.txt"); if(rf.open("w")){rf.write("OK seed="+seed+" "+g.palette+"/"+g.head+"/"+g.body+"/"+g.hair+"/"+g.eyes+"/"+g.top+"/"+g.bottom);rf.close();} }catch(e){}
    app.endUndoGroup();
    if(!$.global.CB_QUIET) alert("Built character "+seed);
})();
}
