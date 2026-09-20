/*
 * hair_study.jsx (v2) — path-based hairstyles. Each style is a smooth
 * closed silhouette (front scalp+hairline, and a back mass) built from a
 * vertex list with auto-computed smooth tangents — NOT circle clusters.
 * The front cap fully covers the scalp to a continuous hairline, so there
 * is no center gap / "balding" triangle.
 * Renders one comp (grid); label in post. ES3 / ExtendScript.
 */
if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") print("hair_study: syntax check only.");
} else {
(function () {
    var INK=[0.102,0.086,0.114], SKIN=[0.976,0.965,0.945], WHITE=[0.985,0.980,0.970],
        HAIR=[0.086,0.075,0.094], BG=[0.945,0.706,0.169];
    var LW=6;
    function layer(c,n){ var l=c.layers.addShape(); l.name=n; return l; }
    function grp(l,n){ var g=l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name=n; return g.property("ADBE Vectors Group"); }
    function ell(v,c,s){ var e=v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue(s); e.property("ADBE Vector Ellipse Position").setValue(c); return e; }
    function fill(v,c){ var f=v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(c); return f; }
    function strk(v,c,w){ var s=v.addProperty("ADBE Vector Graphic - Stroke"); s.property("ADBE Vector Stroke Color").setValue(c); s.property("ADBE Vector Stroke Width").setValue(w); try{s.property("ADBE Vector Stroke Line Cap").setValue(2);}catch(e){} try{s.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e2){} return s; }
    function pos(l,p){ l.property("ADBE Transform Group").property("ADBE Position").setValue(p); }
    function pathTiny(v,ve,i,o,c){ var pg=v.addProperty("ADBE Vector Shape - Group"); var s=new Shape(); s.vertices=ve; s.inTangents=i; s.outTangents=o; s.closed=(c!==false); pg.property("ADBE Vector Shape").setValue(s); return pg; }
    // smooth closed path from vertices (Catmull-Rom-ish tangents)
    function smooth(v, pts, k){
        if(k==null) k=0.28; var n=pts.length, ins=[], outs=[];
        for(var i=0;i<n;i++){ var p0=pts[(i-1+n)%n], p1=pts[(i+1)%n];
            var tx=(p1[0]-p0[0])*k, ty=(p1[1]-p0[1])*k; outs.push([tx,ty]); ins.push([-tx,-ty]); }
        pathTiny(v, pts, ins, outs, true);
    }

    // --- hairstyle silhouettes (vertex loops). face is ellipse ~228x258. ---
    var FRONT={
        bob:[[-108,-42],[-138,-118],[-70,-166],[70,-166],[138,-118],[108,-42],[58,-58],[0,-52],[-58,-58]],
        sideswept:[[-108,-64],[-140,-128],[-20,-172],[104,-150],[144,-74],[120,-14],[30,-52],[-64,-58]],
        curly:[[-110,-44],[-150,-108],[-116,-150],[-58,-176],[0,-160],[58,-176],[116,-150],[150,-108],[110,-44],[54,-56],[0,-50],[-54,-56]],
        "long":[[-108,-42],[-138,-118],[-70,-166],[70,-166],[138,-118],[108,-42],[58,-58],[0,-52],[-58,-58]],
        bun:[[-104,-56],[-130,-120],[0,-152],[130,-120],[104,-56],[0,-90]],
        ponytail:[[-104,-56],[-132,-122],[-6,-152],[126,-118],[104,-52],[0,-88]]
    };
    var BACK={
        bob:[[0,-168],[132,-128],[158,-6],[128,132],[74,156],[52,44],[0,26],[-52,44],[-74,156],[-128,132],[-158,-6],[-132,-128]],
        sideswept:[[0,-170],[128,-120],[150,10],[118,130],[70,150],[52,40],[0,24],[-52,40],[-70,150],[-118,130],[-150,10],[-128,-120]],
        curly:[[0,-182],[92,-170],[152,-120],[178,-30],[150,70],[162,150],[82,150],[54,44],[0,26],[-54,44],[-82,150],[-162,150],[-150,70],[-178,-30],[-152,-120],[-92,-170]],
        "long":[[0,-168],[130,-128],[158,-10],[150,150],[138,330],[92,430],[52,420],[58,120],[0,50],[-58,120],[-52,420],[-92,430],[-138,330],[-150,150],[-158,-10],[-130,-128]],
        bun:[[0,-150],[112,-108],[122,-8],[80,60],[0,42],[-80,60],[-122,-8],[-112,-108]],
        ponytail:[[0,-150],[112,-108],[122,-8],[80,60],[0,42],[-80,60],[-122,-8],[-112,-108]]
    };

    function drawHair(L,style){
        // extras behind (bun knot, ponytail tail) go in the back group
        var bk=grp(L,"back"); smooth(bk,BACK[style]);
        if(style==="bun"){ smooth(bk,[[0,-212],[46,-192],[46,-150],[0,-132],[-46,-150],[-46,-192]]); }
        if(style==="ponytail"){ smooth(bk,[[104,-30],[168,-16],[190,66],[172,156],[138,152],[132,64],[92,8]]); }
        fill(bk,HAIR);
    }

    app.beginUndoGroup("Hair Study");
    for (var i=app.project.numItems;i>=1;i--){var it=app.project.item(i); if(it instanceof CompItem && it.name==="Hair Study") it.remove();}
    var comp=app.project.items.addComp("Hair Study",1560,1160,1,3,24); comp.bgColor=BG;

    function cell(cxx,cyy,style){
        var L=layer(comp,"hair_"+style);
        var ex=40, ey=-4;
        // front-to-back: mouth, eyes, frontHair, face, backHair(+extras)
        var mo=grp(L,"mouth"); pathTiny(mo,[[-16,60],[0,63],[16,60]],[[0,0],[-6,-1],[-6,-1]],[[6,-1],[6,-1],[0,0]],false); strk(mo,INK,LW*0.7);
        var hi=grp(L,"hi"); ell(hi,[-ex-8,ey-14],[13,13]); ell(hi,[ex-8,ey-14],[13,13]); fill(hi,WHITE);
        var ey2=grp(L,"eyes"); ell(ey2,[-ex,ey],[42,56]); ell(ey2,[ex,ey],[42,56]); fill(ey2,INK);
        var fh=grp(L,"front"); smooth(fh,FRONT[style]); fill(fh,HAIR);
        var fc=grp(L,"face"); ell(fc,[0,0],[228,258]); fill(fc,SKIN); strk(fc,INK,LW*1.15);
        drawHair(L,style);
        L.property("ADBE Transform Group").property("ADBE Scale").setValue([76,76]);
        pos(L,[cxx,cyy]);
    }

    var styles=["bob","sideswept","curly","long","bun","ponytail"];
    var xs=[280,780,1280], ys=[330,830];
    for(var t=0;t<styles.length;t++){ cell(xs[t%3], ys[Math.floor(t/3)], styles[t]); }

    comp.openInViewer();
    try{ var rf=new File(Folder.temp.fsName+"/hair_result.txt"); if(rf.open("w")){rf.write("OK");rf.close();} }catch(e){}
    app.endUndoGroup();
    if(!$.global.EYE_QUIET) alert("Hair v2 built.");
})();
}
