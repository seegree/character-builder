/*
 * eye_variety.jsx — a broad library of eye types on a neutral face, to
 * explore the range the "eyes" slot can cover: solid, dots, lines,
 * arcs, winks, and graphic/expression eyes (X, star, heart, swirl, +).
 * This is the exquisite-corpse variety engine for faces.
 * Renders one comp (4x4); label in post. ES3 / ExtendScript.
 */
if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") print("eye_variety: syntax check only.");
} else {
(function () {
    var INK=[0.102,0.086,0.114], SKIN=[0.976,0.965,0.945], WHITE=[0.985,0.980,0.970],
        HAIR=[0.086,0.075,0.094], BG=[0.945,0.706,0.169], REDH=[0.85,0.24,0.28];
    var LW=6;
    function layer(c,n){ var l=c.layers.addShape(); l.name=n; return l; }
    function grp(l,n){ var g=l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name=n; return g.property("ADBE Vectors Group"); }
    function ell(v,c,s){ var e=v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue(s); e.property("ADBE Vector Ellipse Position").setValue(c); return e; }
    function nz(n){var a=[];for(var i=0;i<n;i++)a.push([0,0]);return a;}
    function pth(v,ve,i,o,c){ var pg=v.addProperty("ADBE Vector Shape - Group"); var s=new Shape(); s.vertices=ve; s.inTangents=i||nz(ve.length); s.outTangents=o||nz(ve.length); s.closed=(c!==false); pg.property("ADBE Vector Shape").setValue(s); return pg; }
    function fill(v,c){ var f=v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(c); return f; }
    function strk(v,c,w){ var s=v.addProperty("ADBE Vector Graphic - Stroke"); s.property("ADBE Vector Stroke Color").setValue(c); s.property("ADBE Vector Stroke Width").setValue(w); try{s.property("ADBE Vector Stroke Line Cap").setValue(2);}catch(e){} try{s.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e2){} return s; }
    function pos(l,p){ l.property("ADBE Transform Group").property("ADBE Position").setValue(p); }

    // --- graphic shape point helpers (return vertex arrays) ---
    function starPts(cx,cy,rO,rI){ var p=[]; for(var i=0;i<10;i++){ var a=-Math.PI/2+i*Math.PI/5; var r=(i%2===0)?rO:rI; p.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); } return p; }
    function spiralPts(cx,cy,turns,rmax,n){ var p=[]; for(var i=0;i<=n;i++){ var t=i/n, a=t*turns*2*Math.PI, r=rmax*t; p.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); } return p; }

    function eyeShape(v,type,ex,ey){
        // v is a group; draw both eyes (mirrored at ±ex). Front bits drawn
        // by caller order. Here we just draw the core per type.
        var dirs=[-1,1];
        for(var di=0; di<2; di++){ var s=dirs[di], cxp=s*ex;
            if(type==="almond"){ ell(v,[cxp,ey],[44,60]); }
            else if(type==="dots"){ ell(v,[cxp,ey],[22,22]); }
            else if(type==="bean"){ ell(v,[cxp,ey],[24,60]); }
            else if(type==="round"){ /* handled specially */ }
            else if(type==="lash"){ ell(v,[cxp,ey],[38,50]); }
            else if(type==="sleepy"){ ell(v,[cxp,ey+2],[48,40]); }
            else if(type==="flat"){ pth(v,[[cxp-24,ey],[cxp+24,ey]],null,null,false); }
            else if(type==="happy"){ pth(v,[[cxp-24,ey-6],[cxp,ey+12],[cxp+24,ey-6]],[[0,0],[-12,-4],[-10,4]],[[10,4],[12,-4],[0,0]],false); }
            else if(type==="content"){ pth(v,[[cxp-24,ey+8],[cxp,ey-10],[cxp+24,ey+8]],[[0,0],[-12,4],[-10,-4]],[[10,-4],[12,4],[0,0]],false); }
            else if(type==="wink"){ /* handled specially in cell (mixed fill+stroke) */ }
            else if(type==="wide"){ /* handled specially */ }
            else if(type==="x"){ pth(v,[[cxp-20,ey-20],[cxp+20,ey+20]],null,null,false); pth(v,[[cxp-20,ey+20],[cxp+20,ey-20]],null,null,false); }
            else if(type==="star"){ pth(v, starPts(cxp,ey,30,13), null,null,true); }
            else if(type==="heart"){ pth(v,[[cxp,ey-14],[cxp+26,ey-30],[cxp+30,ey-4],[cxp,ey+28],[cxp-30,ey-4],[cxp-26,ey-30]],
                    [[16,-2],[0,-14],[0,-14],[18,-8],[0,10],[0,-14]],
                    [[-16,-2],[0,14],[-8,14],[-18,-8],[0,-10],[0,14]], true); }
            else if(type==="swirl"){ pth(v, spiralPts(cxp,ey,2.4,26,44), null,null,false); }
            else if(type==="plus"){ pth(v,[[cxp,ey-22],[cxp,ey+22]],null,null,false); pth(v,[[cxp-22,ey],[cxp+22,ey]],null,null,false); }
        }
    }

    app.beginUndoGroup("Eye Variety");
    for (var i=app.project.numItems;i>=1;i--){var it=app.project.item(i); if(it instanceof CompItem && it.name==="Eye Variety") it.remove();}
    var comp=app.project.items.addComp("Eye Variety",1520,1520,1,3,24); comp.bgColor=BG;

    var STROKE_TYPES={flat:1,happy:1,content:1,x:1,swirl:1,plus:1};
    var FILL_RED={heart:1};

    function cell(cxx,cyy,type){
        var L=layer(comp,"e_"+type);
        var ex=38, ey=-4;
        // mouth (small, context)
        var mo=grp(L,"mouth"); pth(mo,[[-16,60],[0,63],[16,60]],[[0,0],[-6,-1],[-6,-1]],[[6,-1],[6,-1],[0,0]],false); strk(mo,INK,LW*0.7);
        // FRONT eye bits (catchlights / lashes) — created first = front
        var f=grp(L,"eyeF");
        if(type==="almond"){ ell(f,[-ex-8,ey-14],[14,14]); ell(f,[ex-8,ey-14],[14,14]); fill(f,WHITE); }
        else if(type==="round"||type==="wide"){ ell(f,[-ex+7,ey-9],[10,10]); ell(f,[ex+7,ey-9],[10,10]); fill(f,WHITE); }
        else if(type==="sleepy"){ ell(f,[-ex-5,ey-2],[14,14]); ell(f,[ex-5,ey-2],[14,14]); fill(f,WHITE); }
        else if(type==="lash"){ var s2=[-1,1]; for(var k=0;k<2;k++){var sd=s2[k]; pth(f,[[sd*ex+sd*20,ey-4],[sd*ex+sd*32,ey-12]],null,null,false); pth(f,[[sd*ex+sd*20,ey+3],[sd*ex+sd*34,ey+1]],null,null,false);} strk(f,INK,LW*0.7); }
        // MID (pupils for round/wide)
        var m=grp(L,"eyeM");
        if(type==="round"){ ell(m,[-ex+3,ey+5],[28,30]); ell(m,[ex+3,ey+5],[28,30]); fill(m,INK); }
        else if(type==="wide"){ ell(m,[-ex+3,ey+6],[18,20]); ell(m,[ex+3,ey+6],[18,20]); fill(m,INK); }
        // BACK core eye shape
        var b=grp(L,"eyeB"); eyeShape(b,type,ex,ey);
        if(STROKE_TYPES[type]){ strk(b,INK, (type==="flat"||type==="plus"||type==="x")?LW*1.3:LW*1.15); }
        else if(type==="round"||type==="wide"){ /* sclera below */ }
        else { fill(b,INK); } // hearts read better solid black than red
        if(type==="round"||type==="wide"){ var sc=grp(L,"sclera"); ell(sc,[-ex,ey],[56,58]); ell(sc,[ex,ey],[56,58]); fill(sc,WHITE); strk(sc,INK,LW); }
        // wink = solid open almond (left) + stroked closed arc (right)
        if(type==="wink"){
            var wl=grp(L,"winkOpen"); ell(wl,[-ex,ey],[44,60]); fill(wl,INK);
            var wr=grp(L,"winkClosed"); pth(wr,[[ex-24,ey+6],[ex,ey-10],[ex+24,ey+6]],[[0,0],[-12,4],[-10,-4]],[[10,-4],[12,4],[0,0]],false); strk(wr,INK,LW*1.15);
        }
        // lid for sleepy
        if(type==="sleepy"){ var lid=grp(L,"lid"); ell(lid,[-ex,ey-22],[58,38]); ell(lid,[ex,ey-22],[58,38]); fill(lid,SKIN); }
        // face + hair
        var fc=grp(L,"face"); ell(fc,[0,0],[228,258]); fill(fc,SKIN); strk(fc,INK,LW*1.15);
        var hc=grp(L,"hair"); ell(hc,[0,-92],[276,210]); fill(hc,HAIR);
        pos(L,[cxx,cyy]);
    }

    var types=["almond","dots","bean","round","lash","sleepy","flat","happy",
               "content","wink","wide","x","star","heart","swirl","plus"];
    var xs=[210,590,970,1350], ys=[230,620,1010,1400]; // 4 cols x 4 rows
    for(var t=0;t<types.length;t++){ cell(xs[t%4], ys[Math.floor(t/4)], types[t]); }

    comp.openInViewer();
    try{ var rf=new File(Folder.temp.fsName+"/eye_variety_result.txt"); if(rf.open("w")){rf.write("OK");rf.close();} }catch(e){}
    app.endUndoGroup();
    if(!$.global.EYE_QUIET) alert("Eye variety built.");
})();
}
