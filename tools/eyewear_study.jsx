/*
 * eyewear_study.jsx (v2) — glasses & shades, cleaned up:
 *  - temples are short stubs that stop AT the face edge (no ears to
 *    tuck behind, so they don't run into the background),
 *  - the bridge only spans the nose gap between lenses (never under them),
 *  - distinct, clean lens shapes.
 * Renders one comp (grid); label in post. ES3 / ExtendScript.
 */
if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") print("eyewear_study: syntax check only.");
} else {
(function () {
    var INK=[0.102,0.086,0.114], SKIN=[0.976,0.965,0.945], WHITE=[0.985,0.980,0.970],
        HAIR=[0.086,0.075,0.094], BG=[0.945,0.706,0.169],
        LENS=[0.17,0.18,0.23], GOLD=[0.83,0.61,0.24];
    var LW=6;
    function layer(c,n){ var l=c.layers.addShape(); l.name=n; return l; }
    function grp(l,n){ var g=l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name=n; return g.property("ADBE Vectors Group"); }
    function ell(v,c,s){ var e=v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue(s); e.property("ADBE Vector Ellipse Position").setValue(c); return e; }
    function rc(v,c,s,r){ var e=v.addProperty("ADBE Vector Shape - Rect"); e.property("ADBE Vector Rect Size").setValue(s); e.property("ADBE Vector Rect Position").setValue(c); e.property("ADBE Vector Rect Roundness").setValue(r); return e; }
    function nz(n){var a=[];for(var i=0;i<n;i++)a.push([0,0]);return a;}
    function pth(v,ve,i,o,c){ var pg=v.addProperty("ADBE Vector Shape - Group"); var s=new Shape(); s.vertices=ve; s.inTangents=i||nz(ve.length); s.outTangents=o||nz(ve.length); s.closed=(c!==false); pg.property("ADBE Vector Shape").setValue(s); return pg; }
    function fill(v,c){ var f=v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(c); return f; }
    function strk(v,c,w){ var s=v.addProperty("ADBE Vector Graphic - Stroke"); s.property("ADBE Vector Stroke Color").setValue(c); s.property("ADBE Vector Stroke Width").setValue(w); try{s.property("ADBE Vector Stroke Line Cap").setValue(2);}catch(e){} try{s.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e2){} return s; }
    function pos(l,p){ l.property("ADBE Transform Group").property("ADBE Position").setValue(p); }
    function smooth(v, pts, k){ if(k==null)k=0.3; var n=pts.length, ins=[], outs=[];
        for(var i=0;i<n;i++){ var p0=pts[(i-1+n)%n], p1=pts[(i+1)%n]; var tx=(p1[0]-p0[0])*k, ty=(p1[1]-p0[1])*k; outs.push([tx,ty]); ins.push([-tx,-ty]); }
        pth(v, pts, ins, outs, true); }

    app.beginUndoGroup("Eyewear Study");
    for (var i=app.project.numItems;i>=1;i--){var it=app.project.item(i); if(it instanceof CompItem && it.name==="Eyewear Study") it.remove();}
    var comp=app.project.items.addComp("Eyewear Study",1520,1140,1,3,24); comp.bgColor=BG;

    var ex=48, ey=-4, FACE_EDGE=108;
    // lens outline for one side (s=-1 left, +1 right) into group g.
    // cat-eye is defined once (right lens, local coords) then reflected via
    // x*s so the pair is a clean mirror (no mirror-tangent asymmetry).
    var CATEYE_LOCAL=[[-28,-2],[-4,-15],[30,-20],[24,16],[-24,14]];
    var AVIATOR_LOCAL=[[0,-22],[26,-10],[16,22],[0,26],[-16,22],[-26,-10]];
    function lens(g,s,type){
        var cxp=s*ex, i;
        if(type==="round"||type==="roundshade"){ ell(g,[cxp,ey],[58,58]); }
        else if(type==="rectangle"||type==="wayfarer"){ rc(g,[cxp,ey],[62,46],9); }
        else if(type==="browline"){ rc(g,[cxp,ey],[60,44],9); }
        else if(type==="cateye"){ var cp=[]; for(i=0;i<CATEYE_LOCAL.length;i++) cp.push([s*(ex+CATEYE_LOCAL[i][0]), ey+CATEYE_LOCAL[i][1]]); smooth(g,cp,0.3); }
        else if(type==="aviator"){ var ap=[]; for(i=0;i<AVIATOR_LOCAL.length;i++) ap.push([cxp+AVIATOR_LOCAL[i][0], ey+AVIATOR_LOCAL[i][1]]); smooth(g,ap,0.32); }
    }

    function cell(cxx,cyy,type){
        var L=layer(comp,"ew_"+type);
        var mo=grp(L,"mouth"); pth(mo,[[-16,60],[0,63],[16,60]],[[0,0],[-6,-1],[-6,-1]],[[6,-1],[6,-1],[0,0]],false); strk(mo,INK,LW*0.7);
        var isShade=(type==="wayfarer"||type==="roundshade"||type==="visor");
        var frameCol=(type==="round"?GOLD:INK);
        // ---- EYEWEAR (front of eyes) ----
        if(type==="visor"){
            var vg=grp(L,"visor");
            rc(vg,[0,ey],[2*(ex+34),34],16);
            fill(vg,LENS); strk(vg,INK,LW);
            var vt=grp(L,"vtemple"); pth(vt,[[-ex-34,ey-10],[-FACE_EDGE,ey-14]],null,null,false); pth(vt,[[ex+34,ey-10],[FACE_EDGE,ey-14]],null,null,false); strk(vt,INK,LW);
        } else if(type==="monocle"){
            var mg=grp(L,"mono"); ell(mg,[ex,ey],[58,58]); strk(mg,GOLD,LW*1.1);
            var mc=grp(L,"chain"); pth(mc,[[ex,ey+29],[ex-4,ey+120]],[[0,0],[8,-38]],[[-6,28],[0,0]],false); strk(mc,GOLD,LW*0.7);
        } else {
            // frame group (front): short temples + gap bridge + lens outlines
            var fr=grp(L,"frame");
            // temples: from outer lens edge to face edge only
            pth(fr,[[-ex-30,ey-6],[-FACE_EDGE,ey-9]],null,null,false);
            pth(fr,[[ex+30,ey-6],[FACE_EDGE,ey-9]],null,null,false);
            // bridge: a short arc at the TOP of the lenses spanning only the
            // nose gap, so it never crosses the lens interior.
            pth(fr,[[-17,ey-15],[0,ey-20],[17,ey-15]],[[0,0],[-9,2],[-7,-3]],[[7,-3],[9,2],[0,0]],false);
            lens(fr,-1,type); lens(fr,1,type);
            strk(fr, frameCol, LW*1.1);
            if(type==="browline"){ // thick top rim across both lenses (the defining feature)
                var bl=grp(L,"browbar");
                pth(bl,[[-ex-30,ey-22],[-ex+30,ey-24]],null,null,false);
                pth(bl,[[ex-30,ey-24],[ex+30,ey-22]],null,null,false);
                strk(bl,INK,LW*2.6);
            }
            if(isShade){ var lf=grp(L,"lensfill"); lens(lf,-1,type); lens(lf,1,type); fill(lf,LENS); }
        }
        // ---- eyes behind (skip for opaque shades/visor) ----
        if(!isShade){
            var e=grp(L,"eyes"); ell(e,[-ex,ey+2],[30,40]); ell(e,[ex,ey+2],[30,40]); fill(e,INK);
            var hi=grp(L,"hi"); ell(hi,[-ex-5,ey-6],[9,9]); ell(hi,[ex-5,ey-6],[9,9]); fill(hi,WHITE);
        }
        var fc=grp(L,"face"); ell(fc,[0,0],[228,258]); fill(fc,SKIN); strk(fc,INK,LW*1.15);
        var hc=grp(L,"hair"); ell(hc,[0,-92],[276,210]); fill(hc,HAIR);
        pos(L,[cxx,cyy]);
    }

    var types=["round","rectangle","cateye","aviator","browline","wayfarer","roundshade","visor"];
    var xs=[210,590,970,1350], ys=[250,720];
    for(var t=0;t<types.length;t++){ cell(xs[t%4], ys[Math.floor(t/4)], types[t]); }

    comp.openInViewer();
    try{ var rf=new File(Folder.temp.fsName+"/eyewear_result.txt"); if(rf.open("w")){rf.write("OK");rf.close();} }catch(e){}
    app.endUndoGroup();
    if(!$.global.EYE_QUIET) alert("Eyewear v2 built.");
})();
}
