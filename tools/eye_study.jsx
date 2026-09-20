/*
 * eye_study.jsx — refined sheet of eye TYPES on a neutral face.
 * Updated per feedback: smaller eyes overall, symmetric almond (no
 * mirror bug), Button dropped, Sleepy given bigger highlights.
 * Renders one comp; label in post. ES3 / ExtendScript.
 */
if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") print("eye_study: syntax check only.");
} else {
(function () {
    var INK=[0.102,0.086,0.114], SKIN=[0.976,0.965,0.945], WHITE=[0.985,0.980,0.970],
        HAIR=[0.086,0.075,0.094], BG=[0.945,0.706,0.169];
    var LW=7;
    function layer(c,n){ var l=c.layers.addShape(); l.name=n; return l; }
    function grp(l,n){ var g=l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name=n; return g.property("ADBE Vectors Group"); }
    function ell(v,c,s){ var e=v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue(s); e.property("ADBE Vector Ellipse Position").setValue(c); return e; }
    function nz(n){var a=[];for(var i=0;i<n;i++)a.push([0,0]);return a;}
    function pth(v,ve,i,o,c){ var pg=v.addProperty("ADBE Vector Shape - Group"); var s=new Shape(); s.vertices=ve; s.inTangents=i||nz(ve.length); s.outTangents=o||nz(ve.length); s.closed=(c!==false); pg.property("ADBE Vector Shape").setValue(s); return pg; }
    function fill(v,c){ var f=v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(c); return f; }
    function strk(v,c,w){ var s=v.addProperty("ADBE Vector Graphic - Stroke"); s.property("ADBE Vector Stroke Color").setValue(c); s.property("ADBE Vector Stroke Width").setValue(w); try{s.property("ADBE Vector Stroke Line Cap").setValue(2);}catch(e){} try{s.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e2){} return s; }
    function pos(l,p){ l.property("ADBE Transform Group").property("ADBE Position").setValue(p); }

    app.beginUndoGroup("Eye Study");
    for (var i=app.project.numItems;i>=1;i--){var it=app.project.item(i); if(it instanceof CompItem && it.name==="Eye Study") it.remove();}
    var comp=app.project.items.addComp("Eye Study",1200,900,1,3,24); comp.bgColor=BG;

    // groups created FRONT->BACK: mouth, nose, brow, eyeF, eyeM, eyeB, [lid], face, hair
    function cell(cxx,cyy,type){
        var L=layer(comp,"eye_"+type);
        var ex=40, ey=-6;
        var mo=grp(L,"mouth"); pth(mo,[[-18,64],[0,67],[18,64]],[[0,0],[-7,-1],[-7,-1]],[[7,-1],[7,-1],[0,0]],false); strk(mo,INK,LW*0.7);
        var no=grp(L,"nose"); pth(no,[[-3,32],[4,42]],[[0,0],[-4,-3]],[[3,3],[0,0]],false); strk(no,INK,LW*0.55);
        var br=grp(L,"brow");
        if(type==="bean"){
            pth(br,[[-ex-22,-52],[-ex+22,-52]],null,null,false); pth(br,[[ex-22,-52],[ex+22,-52]],null,null,false); strk(br,INK,LW*1.5);
        } else if(type==="lash"){
            pth(br,[[-ex-18,-56],[-ex+16,-62]],[[0,0],[-10,2]],[[10,-2],[0,0]],false);
            pth(br,[[ex-16,-62],[ex+18,-56]],[[0,0],[-10,-2]],[[10,2],[0,0]],false); strk(br,INK,LW*0.75);
        } else {
            pth(br,[[-ex-18,-52],[-ex+14,-58]],[[0,0],[-10,2]],[[10,-2],[0,0]],false);
            pth(br,[[ex-14,-58],[ex+18,-52]],[[0,0],[-10,-2]],[[10,2],[0,0]],false); strk(br,INK,LW*0.75);
        }
        // eye front bits
        var f=grp(L,"eyeF");
        if(type==="almond"){ ell(f,[-ex-9,ey-16],[16,16]); ell(f,[-ex+7,ey+6],[8,8]); ell(f,[ex-7,ey-16],[16,16]); ell(f,[ex+9,ey+6],[8,8]); fill(f,WHITE); }
        else if(type==="round"){ ell(f,[-ex+7,ey-9],[10,10]); ell(f,[ex+7,ey-9],[10,10]); fill(f,WHITE); }
        else if(type==="sleepy"){ ell(f,[-ex-6,ey-2],[16,16]); ell(f,[ex-6,ey-2],[16,16]); fill(f,WHITE); }
        else if(type==="lash"){
            pth(f,[[-ex-22,ey-4],[-ex-34,ey-12]],null,null,false); pth(f,[[-ex-22,ey+3],[-ex-36,ey+1]],null,null,false);
            pth(f,[[ex+22,ey-4],[ex+34,ey-12]],null,null,false); pth(f,[[ex+22,ey+3],[ex+36,ey+1]],null,null,false);
            strk(f,INK,LW*0.75);
        }
        // eye mid bits
        var m=grp(L,"eyeM");
        if(type==="round"){ ell(m,[-ex+3,ey+6],[30,32]); ell(m,[ex+3,ey+6],[30,32]); fill(m,INK); }
        else if(type==="sleepy"){ /* lid in back group */ }
        // eye back (shape / sclera)
        var b=grp(L,"eyeB");
        if(type==="almond"){ ell(b,[-ex,ey],[48,66]); ell(b,[ex,ey],[48,66]); fill(b,INK); }
        else if(type==="bean"){ ell(b,[-ex,ey],[26,64]); ell(b,[ex,ey],[26,64]); fill(b,INK); }
        else if(type==="lash"){ ell(b,[-ex,ey],[40,54]); ell(b,[ex,ey],[40,54]); fill(b,INK); }
        else if(type==="round"){ ell(b,[-ex,ey],[58,60]); ell(b,[ex,ey],[58,60]); fill(b,WHITE); strk(b,INK,LW); }
        else if(type==="sleepy"){
            ell(b,[-ex,ey+2],[52,44]); ell(b,[ex,ey+2],[52,44]); fill(b,INK);
            var lid=grp(L,"lid"); ell(lid,[-ex,ey-24],[60,40]); ell(lid,[ex,ey-24],[60,40]); fill(lid,SKIN);
        }
        var fc=grp(L,"face"); ell(fc,[0,0],[240,272]); fill(fc,SKIN); strk(fc,INK,LW*1.1);
        var hc=grp(L,"hair"); ell(hc,[0,-96],[290,220]); fill(hc,HAIR);
        pos(L,[cxx,cyy]);
    }

    var types=["almond","bean","lash","round","sleepy"];
    var cols=[250,600,950], rows=[250,600];
    for(var t=0;t<types.length;t++){ cell(cols[t%3], rows[Math.floor(t/3)], types[t]); }

    comp.openInViewer();
    try{ var rf=new File(Folder.temp.fsName+"/eye_study_result.txt"); if(rf.open("w")){rf.write("OK");rf.close();} }catch(e){}
    app.endUndoGroup();
    if(!$.global.EYE_QUIET) alert("Eye study built.");
})();
}
