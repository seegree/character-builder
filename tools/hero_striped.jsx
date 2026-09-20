/*
 * hero_striped.jsx — fidelity-proof hero (Milestone: style ceiling).
 *
 * Hand-authored reproduction of the modern-flat "striped-sweater girl"
 * reference (character-ref-ai/...e28b1aec_2), as layered AE shape art,
 * to prove how far vector fidelity can go before we design the richer
 * part library. Front-facing rest pose; not rigged yet (look first).
 *
 * Run in AE. $.global.HERO_QUIET=1 suppresses the alert.
 * ES3 / ExtendScript. Exits cleanly under jsc for syntax checks.
 */

if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") print("hero_striped: syntax check only.");
} else {
(function () {

    // ---- palette (from the reference) ----
    var BG    = [0.945, 0.706, 0.169];   // warm gold ground
    var INK   = [0.102, 0.086, 0.114];   // near-black outline
    var SKIN  = [0.976, 0.965, 0.945];   // pale face
    var HAIR  = [0.086, 0.075, 0.094];   // black hair
    var SWEAT = [0.905, 0.271, 0.176];   // red sweater
    var LEGS  = [0.118, 0.106, 0.129];   // black leggings
    var WHITE = [0.985, 0.980, 0.970];
    var SHADOW= [0.80, 0.58, 0.13];
    // spray-shade tones (light from upper-left)
    var SKIN_SH=[0.90,0.87,0.82], SKIN_HI=[1,0.995,0.975];
    var SWEAT_SH=[0.70,0.17,0.11], SWEAT_HI=[0.97,0.44,0.32];
    var HAIR_HI=[0.30,0.28,0.33];

    var LW = 8; // base line weight

    // ---- primitives ----
    function layer(comp, name){ var l=comp.layers.addShape(); l.name=name; return l; }
    function grp(l,name){ var g=l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name=name; return g.property("ADBE Vectors Group"); }
    function ell(v,c,s){ var e=v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue(s); e.property("ADBE Vector Ellipse Position").setValue(c); return e; }
    function rc(v,c,s,r){ var e=v.addProperty("ADBE Vector Shape - Rect"); e.property("ADBE Vector Rect Size").setValue(s); e.property("ADBE Vector Rect Position").setValue(c); e.property("ADBE Vector Rect Roundness").setValue(r); return e; }
    function pth(v,verts,ins,outs,closed){ var pg=v.addProperty("ADBE Vector Shape - Group"); var s=new Shape(); s.vertices=verts; s.inTangents=ins||nZeros(verts.length); s.outTangents=outs||nZeros(verts.length); s.closed=(closed!==false); pg.property("ADBE Vector Shape").setValue(s); return pg; }
    function nZeros(n){ var a=[]; for(var i=0;i<n;i++) a.push([0,0]); return a; }
    function fill(v,c){ var f=v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(c); return f; }
    function strk(v,c,w){ var s=v.addProperty("ADBE Vector Graphic - Stroke"); s.property("ADBE Vector Stroke Color").setValue(c); s.property("ADBE Vector Stroke Width").setValue(w); try{s.property("ADBE Vector Stroke Line Cap").setValue(2);}catch(e){} try{s.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e2){} return s; }
    function pos(l,p){ l.property("ADBE Transform Group").property("ADBE Position").setValue(p); }
    function op(l,v){ l.property("ADBE Transform Group").property("ADBE Opacity").setValue(v); }

    // Spray-shade: soft shadow/highlight tones clipped to a form via an
    // alpha matte, so grain (added at the end) rides the gradients and
    // reads as gritty airbrush/riso shading instead of doing nothing on
    // flat fills. Each tone is a full-comp solid with a FEATHERED elliptical
    // mask (feather softens with no bounding-box artifact), then matted to
    // the form silhouette. tones = [mx,my,rx,ry,color,opacity,feather,blend]
    // in absolute comp coordinates.
    function ellipseMaskShape(mx,my,rx,ry){
        var k=0.5523, s=new Shape();
        s.vertices=[[mx,my-ry],[mx+rx,my],[mx,my+ry],[mx-rx,my]];
        s.inTangents=[[-rx*k,0],[0,-ry*k],[rx*k,0],[0,ry*k]];
        s.outTangents=[[rx*k,0],[0,ry*k],[-rx*k,0],[0,-ry*k]];
        s.closed=true; return s;
    }
    function shadeForm(nm, silFn, p, tones){
        for(var i=0;i<tones.length;i++){
            var t=tones[i];
            var s=comp.layers.addSolid(t[4], nm+"_t"+i, comp.width, comp.height, 1);
            var mask=s.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            mask.property("ADBE Mask Shape").setValue(ellipseMaskShape(t[0],t[1],t[2],t[3]));
            try{ mask.property("ADBE Mask Feather").setValue([t[6],t[6]]); }catch(e){}
            op(s,t[5]); if(t[7]) s.blendingMode=t[7];
            var matte=layer(comp,nm+"_m"+i); var mv=grp(matte,"g"); silFn(mv); fill(mv,[1,1,1]); pos(matte,p);
            s.trackMatteType=TrackMatteType.ALPHA;
        }
    }

    // ---- build ----
    app.beginUndoGroup("Hero: Striped Girl");
    for (var i=app.project.numItems;i>=1;i--){var it=app.project.item(i); if(it instanceof CompItem && it.name==="Hero Striped") it.remove();}
    var comp=app.project.items.addComp("Hero Striped",1000,1400,1,5,24);
    comp.bgColor=BG;

    var cx=500;

    // Layers are created BACK -> FRONT (later layer = in front).

    // ground shadow
    var sh=layer(comp,"Shadow"); var shv=grp(sh,"g"); ell(shv,[0,0],[300,60]); fill(shv,SHADOW); pos(sh,[cx,1322]);

    // back hair mass — a cluster of overlapping black lobes reads as a
    // soft, voluminous messy bob (hand-tangented paths went spiky).
    var hb=layer(comp,"HairBack"); var hbv=grp(hb,"g");
    // A shoulder-length messy bob: flatter top, lobes that frame down
    // the sides past the jaw, with slight asymmetry so it isn't a
    // perfect round poof. Still one group/one layer.
    function hairLobes(v){
        var lobes=[[0,-30,360,352],[-118,-170,206,206],[116,-176,206,206],[0,-198,238,182],
            [-206,-26,186,292],[210,-16,186,296],[-182,150,176,300],[190,164,172,314],
            [-112,258,150,168],[136,268,156,172]];
        for(var Li=0;Li<lobes.length;Li++){ ell(v,[lobes[Li][0],lobes[Li][1]],[lobes[Li][2],lobes[Li][3]]); }
    }
    hairLobes(hbv);
    fill(hbv,HAIR);
    pos(hb,[cx,470]);
    // hair sheen: a soft off-center streak (not a centered blob, which
    // reads as a bald spot), subtle.
    shadeForm("hairHi", hairLobes, [cx,470], [
        [cx-120, 300, 90, 150, HAIR_HI, 32, 90, BlendingMode.SCREEN]
    ]);
    // a few flyaway strands (thin strokes) for hand-drawn messiness
    var wisp=layer(comp,"Wisps"); var wv=grp(wisp,"g");
    pth(wv,[[-176,-120],[-236,-186]],[[0,0],[26,6]],[[-22,-16],[0,0]],false);
    pth(wv,[[150,-160],[224,-214]],[[0,0],[-28,10]],[[20,-20],[0,0]],false);
    pth(wv,[[70,-198],[92,-258]],[[0,0],[-12,10]],[[8,-18],[0,0]],false);
    strk(wv,HAIR,9);
    pos(wisp,[cx,470]);

    // legs (leggings) — tapered thigh->ankle with a gentle organic bow,
    // ending just above the shoe so the ankle tucks into the opening.
    // clean tapered leg (thigh -> ankle), gentle outer calf curve, no
    // self-intersecting tangents.
    function leg(nm,x,dir){
        var l=layer(comp,nm); var v=grp(l,"g");
        pth(v,[[-20,0],[20,0],[11,352],[-11,352]],
            [[0,0],[0,0],[0,0],[0,0]],
            [[0,0],[0,0],[0,0],[0,0]],true);
        fill(v,LEGS); strk(v,INK,LW); pos(l,[x,905]);
    }
    leg("LegL",cx-50,-1);
    leg("LegR",cx+50,1);

    // shoes: low-top sneaker in 3/4 profile pointing outward (dir). The
    // shoe is drawn in FRONT of the leg, and its ankle collar sits over
    // the leg's bottom so the leg reads as entering the shoe opening.
    // Groups created FRONT->BACK: laces, toe cap, upper, sole.
    function shoe(nm,x,dir){
        var s=layer(comp,nm);
        var lc=grp(s,"lace");
        pth(lc,[[4*dir,-8],[34*dir,-4]],null,null,false);
        pth(lc,[[2*dir,4],[32*dir,9]],null,null,false);
        strk(lc,INK,LW*0.7);
        var toe=grp(s,"toe");
        pth(toe,[[50*dir,-4],[88*dir,4],[92*dir,22],[50*dir,22]],
            [[0,-12],[-6,-6],[0,0],[0,0]],[[10,10],[4,10],[0,0],[0,0]],true);
        fill(toe,WHITE); strk(toe,INK,LW*0.8);
        var up=grp(s,"upper");
        pth(up,[[-26*dir,-16],[16*dir,-20],[84*dir,2],[90*dir,20],[-36*dir,20],[-42*dir,2]],
            [[0,-8],[-14*dir,-4],[0,-12],[0,0],[0,0],[0,8]],
            [[14*dir,6],[16*dir,8],[0,12],[0,0],[0,0],[0,-8]],true);
        fill(up,SWEAT); strk(up,INK,LW);
        var sole=grp(s,"sole");
        pth(sole,[[-40*dir,18],[86*dir,14],[92*dir,30],[-40*dir,32]],
            [[0,-6],[-10,-4],[0,0],[0,0]],[[10,4],[6,8],[0,0],[0,0]],true);
        fill(sole,WHITE); strk(sole,INK,LW*0.8);
        pos(s,[x,1250]);
    }
    shoe("ShoeL",cx-52,-1);
    shoe("ShoeR",cx+52,1);

    // --- striped garment helper: red base + black bars clipped to the
    // silhouette via an alpha track matte + a crisp outline on top. ---
    var STRIPE_PERIOD=52, STRIPE_PHASE=623; // shared world grid so body & sleeves align
    function stripedPart(nm, drawFn, p, halfW, top, bot, sw){
        var base=layer(comp,nm+"_base"); var bv=grp(base,"g"); drawFn(bv,1); fill(bv,SWEAT); pos(base,p);
        var stripes=layer(comp,nm+"_stripes"); var stv=grp(stripes,"g");
        var localPhase=STRIPE_PHASE-p[1];
        var k=Math.ceil((top-localPhase)/STRIPE_PERIOD);
        for(;;k++){ var yc=localPhase+k*STRIPE_PERIOD; if(yc>bot) break; rc(stv,[0,yc],[halfW*2+80,26],0); }
        fill(stv,INK); pos(stripes,p);
        var matte=layer(comp,nm+"_matte"); var mv=grp(matte,"g"); drawFn(mv,1); fill(mv,WHITE); pos(matte,p);
        stripes.trackMatteType = TrackMatteType.ALPHA; // matte = layer above
        var out=layer(comp,nm+"_out"); var ov=grp(out,"g"); drawFn(ov,1); strk(ov,INK,sw); pos(out,p);
    }
    function sleevePath(v,dir){
        pth(v,[[-42*dir,-48],[40*dir,-40],[64*dir,150],[40*dir,205],[-30*dir,205],[-58*dir,150]],
            [[0,-24],[-18*dir,-14],[0,-30],[0,0],[0,0],[0,-30]],
            [[18*dir,20],[20*dir,16],[0,40],[0,0],[0,0],[0,40]],true);
    }
    function sweaterPath(v){
        pth(v,
            [[-158,-120],[0,-158],[158,-120],[172,70],[95,152],[0,140],[-95,152],[-172,70]],
            [[0,-56],[-80,0],[0,-56],[0,-70],[44,-6],[46,4],[0,10],[10,60]],
            [[0,56],[80,0],[0,56],[0,70],[-10,10],[-46,4],[-44,-6],[0,-60]],
            true);
    }
    // sleeves first (behind body), then the body
    stripedPart("SleeveL", function(v){ sleevePath(v,-1); }, [cx-150,702], 64, -50, 210, LW);
    stripedPart("SleeveR", function(v){ sleevePath(v,1); }, [cx+150,702], 64, -50, 210, LW);
    stripedPart("Sweater", function(v){ sweaterPath(v); }, [cx,770], 175, -160, 155, LW*1.05);
    // spray-shade the sweater: bottom/side core shadow + chest highlight
    shadeForm("swSh", function(v){ sweaterPath(v); }, [cx,770], [
        [cx, 924, 230, 120, SWEAT_SH, 62, 110, BlendingMode.MULTIPLY],
        [cx-46, 674, 128, 88, SWEAT_HI, 48, 110, BlendingMode.SCREEN]
    ]);

    // hands (pale four-finger, at cuffs)
    function hand(nm,x){
        var h=layer(comp,nm); var v=grp(h,"g");
        ell(v,[0,0],[46,54]); ell(v,[-18,-10],[20,30]); fill(v,SKIN); strk(v,INK,LW*0.8);
        pos(h,[x,872]);
    }
    hand("HandL",cx-196); hand("HandR",cx+196);

    // neck (short; tucked behind the sweater collar)
    var nk=layer(comp,"Neck"); var nkv=grp(nk,"g"); rc(nkv,[0,0],[46,44],14); fill(nkv,SKIN); strk(nkv,INK,LW*0.9); pos(nk,[cx,636]);

    // face (clean egg, guaranteed symmetric)
    function faceSil(v){ ell(v,[0,0],[300,344]); }
    var fc=layer(comp,"Face"); var fcv=grp(fc,"g");
    faceSil(fcv);
    fill(fcv,SKIN); strk(fcv,INK,LW); pos(fc,[cx,455]);
    // spray-shade the face: cheek/jaw shadow + forehead highlight
    shadeForm("faceSh", faceSil, [cx,455], [
        [cx+66, 551, 150, 150, SKIN_SH, 62, 100, BlendingMode.MULTIPLY],
        [cx-72, 371, 108, 108, SKIN_HI, 55, 105, BlendingMode.SCREEN]
    ]);

    // eyes: SOLID-BLACK almonds with catchlights. Shape is a SYMMETRIC
    // almond (same for both eyes) so there's no mirror-tangent asymmetry;
    // catchlights sit on the same side (single light source).
    function almondAt(v,px,py,w,h){
        pth(v,[[px,py-h],[px+w,py],[px,py+h],[px-w,py]],
            [[w*0.62,0],[0,-h*0.58],[-w*0.62,0],[0,h*0.58]],
            [[-w*0.62,0],[0,h*0.58],[w*0.62,0],[0,-h*0.58]], true);
    }
    function eye(nm,x){
        var e=layer(comp,nm);
        var h=grp(e,"hi"); ell(h,[-11,-24],[23,23]); fill(h,WHITE);
        var h2=grp(e,"hi2"); ell(h2,[13,8],[10,10]); fill(h2,WHITE);
        var b=grp(e,"eye"); ell(b,[0,0],[60,96]); fill(b,INK);
        pos(e,[x,472]);
    }
    eye("EyeL",cx-54); eye("EyeR",cx+54);

    // brows: thin gentle arcs, a small gap above each eye
    var br=layer(comp,"Brows"); var brv=grp(br,"L");
    pth(brv,[[-86,4],[-34,-6]],[[0,0],[-16,4]],[[16,-4],[0,0]],false); strk(brv,INK,LW*0.8);
    var brR=grp(br,"R"); pth(brR,[[34,-6],[86,4]],[[0,0],[-16,-4]],[[16,4],[0,0]],false); strk(brR,INK,LW*0.8);
    pos(br,[cx,372]);

    // nose: a single tiny soft tick, above; mouth: understated line, below.
    var nm2=layer(comp,"Face2");
    var nov=grp(nm2,"nose"); pth(nov,[[-3,-22],[4,-10]],[[0,0],[-4,-3]],[[3,3],[0,0]],false); strk(nov,INK,LW*0.6);
    var mo=grp(nm2,"mouth"); pth(mo,[[-20,20],[0,23],[20,20]],[[0,0],[-8,-1],[-8,-1]],[[8,-1],[8,-1],[0,0]],false); strk(mo,INK,LW*0.72);
    pos(nm2,[cx,532]);

    // front fringe: soft rounded bangs from overlapping lobes, parted a
    // little off-center, tips ending just above the eyes.
    var hf=layer(comp,"HairFront"); var hfv=grp(hf,"g");
    var bangs=[[-150,-40,150,150],[-92,10,140,160],[-14,-4,130,170],[70,6,140,165],[150,-30,150,150]];
    for(var Bi=0;Bi<bangs.length;Bi++){ ell(hfv,[bangs[Bi][0],bangs[Bi][1]],[bangs[Bi][2],bangs[Bi][3]]); }
    fill(hfv,HAIR);
    pos(hf,[cx,330]);

    // texture pass: grit over the whole image (reads on the shade
    // gradients above; on flat fills it stays a fine tooth).
    var tex=comp.layers.addSolid([0.5,0.5,0.5],"FX_Grit",comp.width,comp.height,1);
    tex.adjustmentLayer=true; tex.moveToBeginning();
    var noise=tex.property("ADBE Effect Parade").addProperty("ADBE Noise");
    try{ noise.property("ADBE Noise-0001").setValue(22); }catch(e){}
    tex.property("ADBE Transform Group").property("ADBE Opacity").setValue(52);

    comp.openInViewer();
    try{ var rf=new File(Folder.temp.fsName+"/hero_result.txt"); if(rf.open("w")){rf.write("OK layers="+comp.numLayers);rf.close();} }catch(er){}
    app.endUndoGroup();
    if(!$.global.HERO_QUIET) alert("Hero built.");

})();
}
