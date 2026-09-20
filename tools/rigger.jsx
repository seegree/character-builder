/*
 * rigger.jsx — the art-agnostic rig engine.
 *
 * CBRIG.rig(comp) rigs ANY comp whose layers follow docs/rig-convention.md:
 * structural layers named CB_Master / CB_Hips / CB_Chest / CB_Head /
 * CB_Arm_L|R / CB_Leg_L|R / CB_Hand_L|R / CB_Foot_L|R, and generic art
 * tagged `CBART <region>` in the layer comment. It builds controllers,
 * hose-IK expressions, and the hierarchy. Works on generated characters,
 * hand-built AE art, or imported+organized art.
 *
 * Run directly to rig the active comp, or load with $.global.CB_NOAUTO=1
 * to use $.global.CBRIG.rig(comp) from another script.
 * ES3 / ExtendScript.
 */
if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") print("rigger: syntax check only.");
} else {
(function () {

    function grp(l,n){ var g=l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name=n; return g.property("ADBE Vectors Group"); }
    function ell(v,c,s){ var e=v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue(s); e.property("ADBE Vector Ellipse Position").setValue(c); return e; }
    function rc(v,c,s,r){ var e=v.addProperty("ADBE Vector Shape - Rect"); e.property("ADBE Vector Rect Size").setValue(s); e.property("ADBE Vector Rect Position").setValue(c); e.property("ADBE Vector Rect Roundness").setValue(r); return e; }
    function strk(v,c,w){ var s=v.addProperty("ADBE Vector Graphic - Stroke"); s.property("ADBE Vector Stroke Color").setValue(c); s.property("ADBE Vector Stroke Width").setValue(w); return s; }
    function fillP(v,c){ var f=v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(c); return f; }
    function setPos(l,p){ l.property("ADBE Transform Group").property("ADBE Position").setValue(p); }
    function tGroup(l){ return l.property("ADBE Transform Group"); }

    // ---- find layers by name / collect all ----
    function byName(comp){ var m={}; for(var i=1;i<=comp.numLayers;i++){ m[comp.layer(i).name]=comp.layer(i); } return m; }

    // ---- parse the limb comment: "CBLIMB tip=120,240 bend=1" ----
    function parseLimb(cmt){
        var out={tip:[0,100],bend:1}; if(!cmt) return out;
        var parts=cmt.split(" ");
        for(var i=0;i<parts.length;i++){ var kv=parts[i].split("=");
            if(kv[0]==="tip"){ var xy=kv[1].split(","); out.tip=[parseFloat(xy[0]),parseFloat(xy[1])]; }
            else if(kv[0]==="bend"){ out.bend=parseFloat(kv[1]); }
        } return out;
    }
    function tagRegion(cmt){ if(!cmt) return null; var p=cmt.split(" "); if(p[0]==="CBART") return p[1]; return null; }

    // ---- hose-IK expression (see docs/rigging-notes.md) ----
    function hoseExpr(ctrlName){
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

    // ---- recursively set an expression on every ADBE Vector Shape path ----
    function setHoseOnAllPaths(propGroup, expr){
        for(var i=1;i<=propGroup.numProperties;i++){
            var p=propGroup.property(i);
            if(p.matchName==="ADBE Vector Shape"){ try{ p.expression=expr; }catch(e){} }
            else if(p.numProperties && p.numProperties>0){ setHoseOnAllPaths(p, expr); }
        }
    }
    function slider(layer,name,value){
        var fx=layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name=name; fx.property("ADBE Slider Control-0001").setValue(value); return fx;
    }
    function len2(a){ return Math.sqrt(a[0]*a[0]+a[1]*a[1]); }
    function add2(a,b){ return [a[0]+b[0],a[1]+b[1]]; }
    function sub2(a,b){ return [a[0]-b[0],a[1]-b[1]]; }

    function makeCtrl(comp,name,world,drawFn,noFill){
        var l=comp.layers.addShape(); l.name=name; setPos(l,world);
        var v=grp(l,"Ctrl"); drawFn(v); strk(v,[0.90,0.25,0.20], noFill?10:4);
        if(!noFill){ var f=fillP(v,[0.90,0.25,0.20]); try{ f.property("ADBE Vector Fill Opacity").setValue(12); }catch(e){} }
        l.guideLayer=true; l.label=1; return l;
    }

    // ================================================= rig
    function rig(comp){
        var L=byName(comp);
        // --- master ---
        var master=L["CB_Master"];
        if(!master){
            var by=comp.height-60;
            master=makeCtrl(comp,"CB_Master",[comp.width/2,by],function(v){ rc(v,[0,0],[170,40],20); });
            L["CB_Master"]=master;
        }
        var mW=tGroup(master).property("ADBE Position").value;

        // --- body pivots (optional) ---
        function pivotWorld(nm){ return L[nm]? tGroup(L[nm]).property("ADBE Position").value : null; }
        var hips=L["CB_Hips"], chest=L["CB_Chest"], head=L["CB_Head"];

        // --- limbs ---
        var limbNames=["CB_Arm_L","CB_Arm_R","CB_Leg_L","CB_Leg_R"];
        var endFor={ "CB_Arm_L":"CB_Hand_L","CB_Arm_R":"CB_Hand_R","CB_Leg_L":"CB_Foot_L","CB_Leg_R":"CB_Foot_R" };
        for(var i=0;i<limbNames.length;i++){
            var lm=L[limbNames[i]]; if(!lm) continue;
            var info=parseLimb(lm.comment);
            var rootW=tGroup(lm).property("ADBE Position").value;      // joint (layer origin) in comp space
            var tipW=add2(rootW, info.tip);                            // rest wrist/ankle in comp space
            var restLen=len2(info.tip);
            // controller at the tip
            var ctrlName=limbNames[i]+"_CTRL";
            var isArm=(limbNames[i].indexOf("Arm")>=0);
            var ctrl=makeCtrl(comp,ctrlName,tipW,function(v){ ell(v,[0,0],[60,60]); });
            // sliders on the limb
            slider(lm,"Limb Length",restLen);
            slider(lm,"Bend Dir",info.bend);
            // hose expression on all its paths
            setHoseOnAllPaths(lm.property("ADBE Root Vectors Group"), hoseExpr(ctrlName));
            // parent limb to its body root, controller to master
            var bodyRoot = isArm ? (chest||master) : (hips||master);
            reparent(lm, bodyRoot);
            reparent(ctrl, master);
            // parent the end part to the controller
            var end=L[endFor[limbNames[i]]]; if(end) reparent(end, ctrl);
        }

        // --- body hierarchy: Master -> Hips -> Chest -> Head ---
        // CB_Hips / CB_Chest / CB_Head are grabbable controllers the builder
        // provides (or the user names in imported art). Rotating CB_Chest
        // bends the upper body; CB_Head tilts the head about the neck pivot.
        if(hips) reparent(hips, master);
        if(chest) reparent(chest, hips||master);
        if(head) reparent(head, chest||hips||master);

        // --- generic art by region tag ---
        var regionLayer={ master:master, hips:hips||master, chest:chest||hips||master, head:head||chest||master };
        for(var j=1;j<=comp.numLayers;j++){
            var ly=comp.layer(j); var reg=tagRegion(ly.comment);
            if(reg && regionLayer[reg]){ reparent(ly, regionLayer[reg]); }
        }

        // --- lock art (everything that isn't a controller) ---
        for(var k=1;k<=comp.numLayers;k++){ var a=comp.layer(k);
            if(!a.guideLayer && a.name.indexOf("_CTRL")<0 && a.name.indexOf("CB_Head")!==0 && a.name.indexOf("CB_Master")!==0 && a.name.indexOf("CB_Hips")!==0 && a.name.indexOf("CB_Chest")!==0){
                // don't lock limbs (they carry expressions but shouldn't be user-grabbed anyway)
            }
        }
        return true;
    }

    // True world position, walking the parent chain. Valid at rig time
    // because nothing is rotated/scaled yet and pivots have anchor [0,0]:
    // childWorld = parentWorld + childRelativePosition.
    function worldPos(layer){
        var p=tGroup(layer).property("ADBE Position").value;
        if(layer.parent) return add2(worldPos(layer.parent), p);
        return p;
    }
    // Parent without moving in world. Reads TRUE world (not the raw
    // position value, which is parent-relative once a layer is nested).
    function reparent(child, parent){
        if(!parent || child===parent || child.parent===parent) return;
        var cw=worldPos(child);
        var pw=worldPos(parent);
        child.parent=parent;
        tGroup(child).property("ADBE Position").setValue(sub2(cw,pw));
    }

    // ================================================= random pose
    // Offsets the limb controllers from their rest positions into one of a
    // few curated attitudes (+ jitter). Requires the comp to be rigged.
    // seed optional for reproducibility.
    var POSES=[
        // each: {armL:[dx,dy], armR:[dx,dy], legL:[dx,dy], legR:[dx,dy]}
        { armL:[-40,-300], armR:[90,-40],  legL:[0,0],    legR:[70,-30] },   // wave
        { armL:[-120,-60], armR:[120,-60], legL:[-30,0],  legR:[30,0]   },   // shrug/out
        { armL:[-30,-260], armR:[30,-260], legL:[-20,0],  legR:[20,0]   },   // cheer
        { armL:[60,-30],   armR:[110,-120],legL:[-40,-40],legR:[50,0]   },   // stride
        { armL:[-110,-120],armR:[60,-30],  legL:[-50,0],  legR:[40,-40] }    // stride-mirror
    ];
    function findLayer(comp,nm){ for(var i=1;i<=comp.numLayers;i++) if(comp.layer(i).name===nm) return comp.layer(i); return null; }
    function pose(comp, seed){
        var rnd = (seed!=null) ? (function(){ var s=(seed>>>0)||1; return function(){ s^=s<<13;s=s>>>0;s^=s>>17;s^=s<<5;s=s>>>0; return (s>>>0)/4294967296; }; })() : Math.random;
        var P=POSES[Math.floor((seed!=null?rnd():Math.random())*POSES.length)];
        var map={ "CB_Arm_L_CTRL":P.armL, "CB_Arm_R_CTRL":P.armR, "CB_Leg_L_CTRL":P.legL, "CB_Leg_R_CTRL":P.legR };
        for(var nm in map){ if(!map.hasOwnProperty(nm)) continue;
            var c=findLayer(comp,nm); if(!c) continue;
            var pos=tGroup(c).property("ADBE Position");
            var base=pos.value; var d=map[nm];
            var jx=(rnd()-0.5)*40, jy=(rnd()-0.5)*40;
            pos.setValue([base[0]+d[0]+jx, base[1]+d[1]+jy]);
        }
        return true;
    }

    // ================================================= idle bounce
    // A subtle breathing bob: hips rise/fall on a slow sine, chest and head
    // follow with a slight delay (secondary motion). Amount is an "Idle"
    // slider on CB_Master (0 = off), so it's tunable and removable.
    function idlePosExpr(ampY, phase){
        return "" +
        "var k=0; try{ k=thisComp.layer(\"CB_Master\").effect(\"Idle\")(\"Slider\"); }catch(e){ k=0; }\n" +
        "[value[0], value[1] + Math.sin(time*2*Math.PI*0.5 + " + phase + ")*" + ampY + "*k];";
    }
    function idle(comp){
        var master=findLayer(comp,"CB_Master"); if(!master) return false;
        var fx=null; try{ fx=master.property("ADBE Effect Parade").property("Idle"); }catch(e){}
        if(!fx){ fx=master.property("ADBE Effect Parade").addProperty("ADBE Slider Control"); fx.name="Idle"; fx.property("ADBE Slider Control-0001").setValue(1); }
        var hips=findLayer(comp,"CB_Hips"), chest=findLayer(comp,"CB_Chest"), head=findLayer(comp,"CB_Head");
        if(hips) tGroup(hips).property("ADBE Position").expression=idlePosExpr(6,0);
        if(chest) tGroup(chest).property("ADBE Position").expression=idlePosExpr(4,-0.5);
        if(head) tGroup(head).property("ADBE Position").expression=idlePosExpr(5,-0.9);
        return true;
    }

    $.global.CBRIG={ rig:rig, pose:pose, idle:idle };
    if($.global.CB_NOAUTO) return;

    if(!(app.project.activeItem instanceof CompItem)){ alert("Open a comp to rig."); return; }
    app.beginUndoGroup("CB Rig");
    rig(app.project.activeItem);
    app.endUndoGroup();
    if(!$.global.CB_QUIET) alert("Rigged.");
})();
}
