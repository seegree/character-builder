/*
 * character_gen.jsx — the assembled generator. Composes the designed
 * part libraries (eyes, brows, mouths, hair, eyewear, palette, top)
 * into a full, textured, rig-ready rubber-hose character driven by a
 * seeded genome. Ports the hero's body + spray-shade.
 *
 * Run in AE. Globals:
 *   $.global.CB_SEED    force a seed
 *   $.global.CB_QUIET   1 to suppress the alert
 *   $.global.CB_NOAUTO  1 to load the API only (for a harness)
 * The API is exposed on $.global.CGEN = { PRNG, roll, build, PALS, ... }.
 * ES3 / ExtendScript.
 */
if (typeof app === "undefined" || !app.project) {
    if (typeof print === "function") print("character_gen: syntax check only.");
} else {
(function () {
    // ---------- primitives ----------
    function layer(c,n){ var l=c.layers.addShape(); l.name=n; return l; }
    function grp(l,n){ var g=l.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); g.name=n; return g.property("ADBE Vectors Group"); }
    function ell(v,c,s){ var e=v.addProperty("ADBE Vector Shape - Ellipse"); e.property("ADBE Vector Ellipse Size").setValue(s); e.property("ADBE Vector Ellipse Position").setValue(c); return e; }
    function rc(v,c,s,r){ var e=v.addProperty("ADBE Vector Shape - Rect"); e.property("ADBE Vector Rect Size").setValue(s); e.property("ADBE Vector Rect Position").setValue(c); e.property("ADBE Vector Rect Roundness").setValue(r); return e; }
    function nz(n){var a=[];for(var i=0;i<n;i++)a.push([0,0]);return a;}
    function pth(v,ve,i,o,c){ var pg=v.addProperty("ADBE Vector Shape - Group"); var s=new Shape(); s.vertices=ve; s.inTangents=i||nz(ve.length); s.outTangents=o||nz(ve.length); s.closed=(c!==false); pg.property("ADBE Vector Shape").setValue(s); return pg; }
    function fill(v,c){ var f=v.addProperty("ADBE Vector Graphic - Fill"); f.property("ADBE Vector Fill Color").setValue(c); return f; }
    function strk(v,c,w){ var s=v.addProperty("ADBE Vector Graphic - Stroke"); s.property("ADBE Vector Stroke Color").setValue(c); s.property("ADBE Vector Stroke Width").setValue(w); try{s.property("ADBE Vector Stroke Line Cap").setValue(2);}catch(e){} try{s.property("ADBE Vector Stroke Line Join").setValue(2);}catch(e2){} return s; }
    function posL(l,p){ l.property("ADBE Transform Group").property("ADBE Position").setValue(p); }
    function opL(l,v){ l.property("ADBE Transform Group").property("ADBE Opacity").setValue(v); }
    function smooth(v, pts, k){ if(k==null)k=0.28; var n=pts.length, ins=[], outs=[]; for(var i=0;i<n;i++){ var p0=pts[(i-1+n)%n], p1=pts[(i+1)%n]; var tx=(p1[0]-p0[0])*k, ty=(p1[1]-p0[1])*k; outs.push([tx,ty]); ins.push([-tx,-ty]); } pth(v,pts,ins,outs,true); }
    function sc(arr,f){ var o=[]; for(var i=0;i<arr.length;i++) o.push([arr[i][0]*f, arr[i][1]*f]); return o; }

    // ---------- PRNG ----------
    function imul(a,b){ a=a>>>0;b=b>>>0; var ah=(a>>>16)&0xffff,al=a&0xffff,bh=(b>>>16)&0xffff,bl=b&0xffff; return ((al*bl)+((((ah*bl+al*bh)&0xffff)<<16)>>>0))>>>0; }
    function hash32(x){ x=x>>>0; x^=x>>>16; x=imul(x,0x7feb352d); x^=x>>>15; x=imul(x,0x846ca68b); x^=x>>>16; return x>>>0; }
    function PRNG(seed){ this.s=hash32((seed>>>0)||1)||1; }
    PRNG.prototype.next=function(){ var x=this.s; x^=x<<13;x=x>>>0; x^=x>>17; x^=x<<5;x=x>>>0; this.s=x; return (x>>>0)/4294967296; };
    PRNG.prototype.rng=function(a,b){ return a+(b-a)*this.next(); };
    PRNG.prototype.pick=function(a){ return a[Math.floor(this.next()*a.length)]; };
    PRNG.prototype.chance=function(p){ return this.next()<p; };

    // ---------- palettes ----------
    function mul(c,f){ return [c[0]*f,c[1]*f,c[2]*f]; }
    function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
    var WHITE=[0.985,0.980,0.970];
    var PALS=[
        { name:"Mustard", bg:[0.945,0.706,0.169], ink:[0.10,0.086,0.11], skin:[0.976,0.965,0.945], hair:[0.086,0.075,0.094], top:[0.905,0.271,0.176], top2:[0.10,0.086,0.11], legs:[0.12,0.107,0.129] },
        { name:"Teal",    bg:[0.93,0.90,0.83],   ink:[0.07,0.10,0.11],  skin:[0.98,0.90,0.80],  hair:[0.09,0.08,0.10],   top:[0.20,0.55,0.55],  top2:[0.98,0.96,0.90],  legs:[0.11,0.13,0.15] },
        { name:"Cobalt",  bg:[0.95,0.83,0.55],   ink:[0.06,0.07,0.12],  skin:[0.97,0.88,0.78],  hair:[0.09,0.08,0.11],   top:[0.20,0.34,0.66],  top2:[0.95,0.76,0.28],  legs:[0.10,0.10,0.14] },
        { name:"Rose",    bg:[0.28,0.30,0.42],   ink:[0.12,0.08,0.12],  skin:[0.99,0.90,0.83],  hair:[0.10,0.08,0.11],   top:[0.88,0.44,0.48],  top2:[0.99,0.96,0.92],  legs:[0.14,0.10,0.14] },
        { name:"Moss",    bg:[0.92,0.88,0.78],   ink:[0.09,0.11,0.07],  skin:[0.97,0.89,0.79],  hair:[0.10,0.09,0.08],   top:[0.52,0.60,0.28],  top2:[0.10,0.10,0.08],  legs:[0.16,0.15,0.10] }
    ];

    // ---------- part libraries ----------
    var EYES=["almond","dots","round","sleepy","happy","wink","star","heart"];
    var BROWS=["none","thin","raised","thick"];
    var MOUTHS=["smile","neutral","open","oh","flat"];
    var HAIRS=["bob","sideswept","curly","long","bun","ponytail","crop","quiff","bald"];
    var FACIAL=["none","none","none","stubble","mustache","beard","goatee"];
    var WEAR=["none","none","none","round","rectangle","wayfarer","roundshade"];
    var TOPS=["solid","striped"];

    // hair silhouettes (authored at study scale ~228 face), scaled by SF
    var HFRONT={
        bob:[[-108,-42],[-138,-118],[-70,-166],[70,-166],[138,-118],[108,-42],[58,-58],[0,-52],[-58,-58]],
        sideswept:[[-108,-64],[-140,-128],[-20,-172],[104,-150],[144,-74],[120,-14],[30,-52],[-64,-58]],
        curly:[[-110,-44],[-150,-108],[-116,-150],[-58,-176],[0,-160],[58,-176],[116,-150],[150,-108],[110,-44],[54,-56],[0,-50],[-54,-56]],
        "long":[[-108,-42],[-138,-118],[-70,-166],[70,-166],[138,-118],[108,-42],[58,-58],[0,-52],[-58,-58]],
        bun:[[-104,-56],[-130,-120],[0,-152],[130,-120],[104,-56],[0,-90]],
        ponytail:[[-104,-56],[-132,-122],[-6,-152],[126,-118],[104,-52],[0,-88]],
        crop:[[-148,-46],[-120,-150],[0,-182],[120,-150],[148,-46],[96,-56],[36,-40],[-30,-56],[-96,-42]],
        quiff:[[-140,-40],[-132,-150],[-40,-212],[34,-206],[120,-150],[140,-40],[96,-54],[36,-40],[-30,-56],[-96,-42]]
    };
    var HBACK={
        bob:[[0,-168],[132,-128],[158,-6],[128,132],[74,156],[52,44],[0,26],[-52,44],[-74,156],[-128,132],[-158,-6],[-132,-128]],
        sideswept:[[0,-170],[128,-120],[150,10],[118,130],[70,150],[52,40],[0,24],[-52,40],[-70,150],[-118,130],[-150,10],[-128,-120]],
        curly:[[0,-182],[92,-170],[152,-120],[178,-30],[150,70],[162,150],[82,150],[54,44],[0,26],[-54,44],[-82,150],[-162,150],[-150,70],[-178,-30],[-152,-120],[-92,-170]],
        "long":[[0,-168],[130,-128],[158,-10],[150,150],[138,330],[92,430],[52,420],[58,120],[0,50],[-58,120],[-52,420],[-92,430],[-138,330],[-150,150],[-158,-10],[-130,-128]],
        bun:[[0,-150],[112,-108],[122,-8],[80,60],[0,42],[-80,60],[-122,-8],[-112,-108]],
        ponytail:[[0,-150],[112,-108],[122,-8],[80,60],[0,42],[-80,60],[-122,-8],[-112,-108]],
        crop:[[0,-178],[128,-140],[150,-30],[126,58],[70,68],[0,56],[-70,68],[-126,58],[-150,-30],[-128,-140]],
        quiff:[[0,-176],[128,-138],[148,-30],[124,56],[70,66],[0,54],[-70,66],[-124,56],[-148,-30],[-128,-138]]
    };

    var SF=1.30; // study(228) -> generator head(~300)
    // Feature coords below are RELATIVE to the head-center layer origin
    // (each feature layer is positioned at [CX,HEADY]).
    var CX=500, HEADY=455, EX=58, EYEY=19; // eyes at head-relative y=19

    // ---------- shade helper (feathered-mask tone clipped to a form) ----------
    function ellipseMask(mx,my,rx,ry){ var k=0.5523,s=new Shape(); s.vertices=[[mx,my-ry],[mx+rx,my],[mx,my+ry],[mx-rx,my]]; s.inTangents=[[-rx*k,0],[0,-ry*k],[rx*k,0],[0,ry*k]]; s.outTangents=[[rx*k,0],[0,ry*k],[-rx*k,0],[0,-ry*k]]; s.closed=true; return s; }
    // Each tone = a full-comp solid with a feathered elliptical mask,
    // clipped to `matteLayer` (an EXISTING form layer — face/top/hair) via
    // the modern setTrackMatte API. No dedicated silhouette copy needed;
    // one layer can matte several tones AND still render (re-enable it).
    function shade(comp, matteLayer, tones, region){
        for(var i=0;i<tones.length;i++){ var t=tones[i];
            var s=comp.layers.addSolid(t[4], "shade", comp.width, comp.height, 1);
            var m=s.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            m.property("ADBE Mask Shape").setValue(ellipseMask(t[0],t[1],t[2],t[3]));
            try{ m.property("ADBE Mask Feather").setValue([t[6],t[6]]); }catch(e){}
            opL(s,t[5]); if(t[7]) s.blendingMode=t[7];
            try{ s.setTrackMatte(matteLayer, TrackMatteType.ALPHA); matteLayer.enabled=true; }catch(e){}
            if(region) s.comment="CBART "+region;
        }
    }

    // ---------- eyes ----------
    function starPts(cx,cy,rO,rI){ var p=[]; for(var i=0;i<10;i++){ var a=-Math.PI/2+i*Math.PI/5; var r=(i%2===0)?rO:rI; p.push([cx+r*Math.cos(a), cy+r*Math.sin(a)]); } return p; }
    function drawEyes(L, type, pal){
        var f=grp(L,"eyeF"), m, b;
        // front (catchlights) first
        if(type==="almond"||type==="dots"){ ell(f,[-EX-9,EYEY-16],[15,15]); ell(f,[EX-9,EYEY-16],[15,15]); fill(f,WHITE); }
        else if(type==="round"){ ell(f,[-EX+7,EYEY-9],[11,11]); ell(f,[EX+7,EYEY-9],[11,11]); fill(f,WHITE); }
        else if(type==="sleepy"){ ell(f,[-EX-6,EYEY-2],[15,15]); ell(f,[EX-6,EYEY-2],[15,15]); fill(f,WHITE); }
        // mid (round pupils)
        if(type==="round"){ m=grp(L,"eyeM"); ell(m,[-EX+3,EYEY+6],[34,36]); ell(m,[EX+3,EYEY+6],[34,36]); fill(m,pal.ink); }
        // back (core shape)
        b=grp(L,"eyeB");
        if(type==="almond"){ ell(b,[-EX,EYEY],[52,74]); ell(b,[EX,EYEY],[52,74]); fill(b,pal.ink); }
        else if(type==="dots"){ ell(b,[-EX,EYEY],[26,26]); ell(b,[EX,EYEY],[26,26]); fill(b,pal.ink); }
        else if(type==="round"){ ell(b,[-EX,EYEY],[70,72]); ell(b,[EX,EYEY],[70,72]); fill(b,WHITE); strk(b,pal.ink,7); }
        else if(type==="sleepy"){ ell(b,[-EX,EYEY+2],[62,50]); ell(b,[EX,EYEY+2],[62,50]); fill(b,pal.ink);
            var lid=grp(L,"lid"); ell(lid,[-EX,EYEY-28],[72,50]); ell(lid,[EX,EYEY-28],[72,50]); fill(lid,pal.skin); }
        else if(type==="happy"){ pth(b,[[-EX-28,EYEY-6],[-EX,EYEY+14],[-EX+28,EYEY-6]],[[0,0],[-14,-4],[-12,4]],[[12,4],[14,-4],[0,0]],false);
            pth(b,[[EX-28,EYEY-6],[EX,EYEY+14],[EX+28,EYEY-6]],[[0,0],[-14,-4],[-12,4]],[[12,4],[14,-4],[0,0]],false); strk(b,pal.ink,9); }
        else if(type==="wink"){ ell(b,[-EX,EYEY],[52,74]); fill(b,pal.ink);
            var w=grp(L,"wink"); pth(w,[[EX-28,EYEY+6],[EX,EYEY-12],[EX+28,EYEY+6]],[[0,0],[-14,4],[-12,-4]],[[12,-4],[14,4],[0,0]],false); strk(w,pal.ink,9); }
        else if(type==="star"){ pth(b, starPts(-EX,EYEY,40,17), null,null,true); pth(b, starPts(EX,EYEY,40,17), null,null,true); fill(b,pal.ink); }
        else if(type==="heart"){ var hp=[[0,-16],[30,-34],[34,-4],[0,32],[-34,-4],[-30,-34]];
            var hpL=[],hpR=[]; for(var i=0;i<hp.length;i++){ hpL.push([-EX+hp[i][0],EYEY+hp[i][1]]); hpR.push([EX+hp[i][0],EYEY+hp[i][1]]); }
            smooth(b,hpL,0.24); smooth(b,hpR,0.24); fill(b,pal.ink); }
    }
    function drawBrows(L,type,pal){
        if(type==="none") return; var b=grp(L,"brows"); var y=EYEY-58, w;
        if(type==="thin"){ w=7; pth(b,[[-EX-24,y+6],[-EX+18,y-4]],[[0,0],[-14,3]],[[14,-3],[0,0]],false); pth(b,[[EX-18,y-4],[EX+24,y+6]],[[0,0],[-14,-3]],[[14,3],[0,0]],false); }
        else if(type==="raised"){ w=8; y-=10; pth(b,[[-EX-22,y+4],[-EX+20,y-2]],[[0,0],[-14,0]],[[14,0],[0,0]],false); pth(b,[[EX-20,y-2],[EX+22,y+4]],[[0,0],[-14,0]],[[14,0],[0,0]],false); }
        else { w=13; pth(b,[[-EX-24,y+4],[-EX+20,y-2]],[[0,0],[-14,2]],[[14,-2],[0,0]],false); pth(b,[[EX-20,y-2],[EX+24,y+4]],[[0,0],[-14,-2]],[[14,2],[0,0]],false); }
        strk(b,pal.ink,w);
    }
    function drawMouthNose(L,type,pal){
        var no=grp(L,"nose"); pth(no,[[-3,58],[5,72]],[[0,0],[-4,-4]],[[4,4],[0,0]],false); strk(no,pal.ink,5);
        var mo=grp(L,"mouth"); var my=96;
        if(type==="smile"){ pth(mo,[[-26,my-4],[0,my+12],[26,my-4]],[[0,0],[-11,-3],[-10,3]],[[10,3],[11,-3],[0,0]],false); strk(mo,pal.ink,7); }
        else if(type==="neutral"){ pth(mo,[[-22,my],[0,my+3],[22,my]],[[0,0],[-9,-1],[-9,-1]],[[9,-1],[9,-1],[0,0]],false); strk(mo,pal.ink,7); }
        else if(type==="open"){ pth(mo,[[-24,my-4],[0,my+16],[24,my-4]],[[0,0],[-12,0],[0,0]],[[12,0],[0,0],[0,0]],true); fill(mo,[0.35,0.12,0.14]); strk(mo,pal.ink,6); }
        else if(type==="oh"){ ell(mo,[0,my+4],[24,28]); fill(mo,[0.35,0.12,0.14]); strk(mo,pal.ink,6); }
        else { pth(mo,[[-20,my],[20,my]],null,null,false); strk(mo,pal.ink,7); }
    }
    function drawEyewear(L,type,pal){
        if(type==="none") return;
        var isShade=(type==="wayfarer"||type==="roundshade");
        var wx=EX, wy=EYEY-6, edge=112;
        var fr=grp(L,"wear");
        // temples to face edge
        pth(fr,[[-wx-40,wy],[-edge,wy-4]],null,null,false); pth(fr,[[wx+40,wy],[edge,wy-4]],null,null,false);
        // bridge arc in the gap
        pth(fr,[[-22,wy-14],[0,wy-20],[22,wy-14]],[[0,0],[-11,2],[-9,-3]],[[9,-3],[11,2],[0,0]],false);
        function lens(g,s){ var cxp=s*wx;
            if(type==="round"||type==="roundshade"){ ell(g,[cxp,wy+2],[76,76]); }
            else { rc(g,[cxp,wy+2],[80,60],11); }
        }
        lens(fr,-1); lens(fr,1); strk(fr,pal.ink,8);
        if(isShade){ var lf=grp(L,"lensfill"); lens(lf,-1); lens(lf,1); fill(lf,[0.17,0.18,0.23]); }
    }

    // ---------- body ----------
    // Proportion archetypes: shoulder/body/sleeve widths, cuff & hem depth,
    // leg length/width/stance. This is where body-shape variety lives.
    // cy = sleeve cuff depth (sleeves hang to near the hips); hy = hem
    // depth (torso length). hy must be well below cy so there's a real
    // belly/hip, not just a shoulder yoke.
    var ARCH={
        average:{sw:150,bw:150,sl:188,cy:200,hy:250,legLen:250,legW:20,stance:50},
        petite: {sw:128,bw:134,sl:162,cy:168,hy:212,legLen:214,legW:18,stance:44},
        round:  {sw:170,bw:192,sl:216,cy:200,hy:250,legLen:206,legW:25,stance:60},
        tall:   {sw:148,bw:146,sl:184,cy:250,hy:300,legLen:300,legW:19,stance:52},
        lanky:  {sw:138,bw:134,sl:172,cy:250,hy:300,legLen:340,legW:15,stance:46}
    };
    var ARCHK=["average","petite","round","tall","lanky"];
    var TORSOY=655;
    // TORSO silhouette only (no sleeves) — symmetric via right-half+mirror,
    // one clean outline. Arms are drawn separately as double-stroked tubes
    // (ink outline stroke under a top-color stroke), which read clearly and
    // leave no stray fill.
    function topPath(v,A){
        var R=[[0,-14],[A.sw*0.68,-16],[A.sw,-2],[A.bw+8,A.hy*0.42],[A.bw,A.hy-26],[A.bw*0.66,A.hy]];
        var pts=[], i; for(i=0;i<R.length;i++) pts.push(R[i]);
        pts.push([0,A.hy+4]);
        for(i=R.length-1;i>=0;i--) pts.push([-R[i][0],R[i][1]]);
        smooth(v,pts,0.2);
    }

    // auto-blink: squashes the eyes' HEIGHT to a line for a fraction of a
    // second (classic cartoon blink — works for every eye type, no lid), at
    // a slightly-randomized interval. Goes on the Eyes layer's Scale; the
    // layer is anchored at eye level so it squashes in place.
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

    // facial hair (HAIR-colored), drawn over the lower face, under the mouth.
    function drawFacial(L, type, pal){
        if(!type || type==="none") return;
        var v=grp(L,"g");
        function beardShape(){ smooth(v,[[-138,26],[-120,110],[-60,166],[0,180],[60,166],[120,110],[138,26],[92,40],[40,64],[0,52],[-40,64],[-92,40]],0.3); }
        function mustacheShape(){ smooth(v,[[-52,80],[-18,74],[0,84],[18,74],[52,80],[30,98],[0,90],[-30,98]],0.3); }
        function goateeShape(){ smooth(v,[[-34,116],[0,110],[34,116],[30,176],[0,182],[-30,176]],0.3); }
        if(type==="beard"){ beardShape(); mustacheShape(); }
        else if(type==="mustache"){ mustacheShape(); }
        else if(type==="goatee"){ goateeShape(); mustacheShape(); }
        else if(type==="stubble"){ beardShape(); }
        fill(v, pal.hair);
        if(type==="stubble"){ opL(L, 26); }   // reads as shadow
    }

    // ---------- genome ----------
    function roll(seed){
        var r=new PRNG(seed), g={seed:seed};
        g.pal=Math.floor(r.next()*PALS.length);
        g.arch=r.pick(ARCHK);
        g.eye=r.pick(EYES); g.brow=r.pick(BROWS); g.mouth=r.pick(MOUTHS);
        g.hair=r.pick(HAIRS); g.wear=r.pick(WEAR); g.top=r.pick(TOPS);
        g.sleeve=r.pick(["long","long","threeq","short"]);
        return g;
    }

    // ---------- build ----------
    function build(comp, g){
        var pal=PALS[g.pal];
        comp.bgColor=pal.bg;
        var INK=pal.ink, SK=pal.skin, HR=pal.hair, TOP=pal.top, TOP2=pal.top2, LEGS=pal.legs, LW=8;
        var SWEAT_SH=mul(TOP,0.72), SWEAT_HI=mix(TOP,WHITE,0.28), SKIN_SH=mul(SK,0.93), SKIN_HI=mix(SK,WHITE,0.5), HAIR_HI=mix(HR,WHITE,0.22);
        var A=ARCH[g.arch];
        var hemY=TORSOY+A.hy, legTop=hemY-18, ankleY=legTop+A.legLen, cuffCompY=TORSOY+A.cy-4, cuffX=A.sl-14;

        // ground shadow (under the feet)
        var sh=layer(comp,"Shadow"); var shv=grp(sh,"g"); ell(shv,[0,0],[A.stance*4+160,58]); fill(shv,mul(pal.bg,0.86)); posL(sh,[CX,ankleY+42]); sh.comment="CBART master";
        // hair back (skip entirely when bald)
        var hb=null;
        if(g.hair!=="bald"){
            hb=layer(comp,"HairBack"); var hbv=grp(hb,"g"); smooth(hbv,sc(HBACK[g.hair],SF));
            if(g.hair==="bun") smooth(hbv,sc([[0,-212],[46,-192],[46,-150],[0,-132],[-46,-150],[-46,-192]],SF));
            if(g.hair==="ponytail") smooth(hbv,sc([[104,-30],[168,-16],[190,66],[172,156],[138,152],[132,64],[92,8]],SF));
            fill(hbv,HR); posL(hb,[CX,HEADY]); hb.comment="CBART head";
        }
        // legs: joint-anchored hose limbs (hip -> ankle), rig-ready
        function legLimb(nm,dir){ var l=layer(comp,nm); var v=grp(l,"g");
            pth(v,[[0,0],[0,A.legLen]],null,null,false);
            strk(v,LEGS,A.legW*2); strk(v,INK,A.legW*2+2*LW);
            l.comment="CBLIMB tip=0,"+A.legLen+" bend="+(dir<0?1:-1);
            posL(l,[CX+dir*A.stance,legTop]); }
        legLimb("CB_Leg_L",-1); legLimb("CB_Leg_R",1);
        // shoes (feet)
        function shoe(nm,x,dir){ var s=layer(comp,nm);
            var lc=grp(s,"lace"); pth(lc,[[4*dir,-8],[34*dir,-4]],null,null,false); pth(lc,[[2*dir,4],[32*dir,9]],null,null,false); strk(lc,INK,LW*0.7);
            var toe=grp(s,"toe"); pth(toe,[[50*dir,-4],[88*dir,4],[92*dir,22],[50*dir,22]],[[0,-12],[-6,-6],[0,0],[0,0]],[[10,10],[4,10],[0,0],[0,0]],true); fill(toe,WHITE); strk(toe,INK,LW*0.8);
            var up=grp(s,"upper"); pth(up,[[-26*dir,-16],[16*dir,-20],[84*dir,2],[90*dir,20],[-36*dir,20],[-42*dir,2]],[[0,-8],[-14*dir,-4],[0,-12],[0,0],[0,0],[0,8]],[[14*dir,6],[16*dir,8],[0,12],[0,0],[0,0],[0,-8]],true); fill(up,TOP); strk(up,INK,LW);
            var sole=grp(s,"sole"); pth(sole,[[-40*dir,18],[86*dir,14],[92*dir,30],[-40*dir,32]],[[0,-6],[-10,-4],[0,0],[0,0]],[[10,4],[6,8],[0,0],[0,0]],true); fill(sole,WHITE); strk(sole,INK,LW*0.8);
            posL(s,[x,ankleY]); }
        shoe("CB_Foot_L",CX-A.stance,-1); shoe("CB_Foot_R",CX+A.stance,1);
        // unified top silhouette (body + sleeves, one outline) + stripes + shading
        var base=layer(comp,"Top"); var bv=grp(base,"g"); topPath(bv,A); fill(bv,TOP); posL(base,[CX,TORSOY]); base.comment="CBART chest";
        if(g.top==="striped"){
            var st=layer(comp,"Stripes"); var stv=grp(st,"g"); var y=-20; while(y<A.hy+4){ rc(stv,[0,y+13],[2*(A.sl+40),26],0); y+=52; } fill(stv,TOP2); posL(st,[CX,TORSOY]); st.comment="CBART chest";
            try{ st.setTrackMatte(base, TrackMatteType.ALPHA); base.enabled=true; }catch(e){}
        }
        var outl=layer(comp,"Top_out"); var ov=grp(outl,"g"); topPath(ov,A); strk(ov,INK,LW*1.05); posL(outl,[CX,TORSOY]); outl.comment="CBART chest";
        if(g.shade!==false) shade(comp, base, [
            [CX, TORSOY+A.hy-6, A.bw*1.35, A.hy*0.8, SWEAT_SH,60,A.bw*0.7,BlendingMode.MULTIPLY],
            [CX-A.bw*0.32, TORSOY+18, A.bw*0.8, A.hy*0.5, SWEAT_HI,46,A.bw*0.7,BlendingMode.SCREEN] ], "chest");
        // ARMS: a skin arm (full) with the SLEEVE trimmed over it, so
        // short/three-quarter/long sleeves and cuffs all work. Each stroke
        // pair is [color (front), ink outline (back, wider)]; Trim Paths
        // clips the sleeve & cuff to the sleeve length.
        var armLen=A.hy-4, shX=A.sw-8, armTipX=10, armTipY=armLen-2;
        var SLEN={"long":0.93,"threeq":0.70,"short":0.46};
        // Joint-anchored STRAIGHT hose arm from [0,0] (shoulder) to the wrist.
        // Bend comes from the rig/pose, not the static art.
        function armPath(v,dir){ pth(v,[[0,0],[dir*armTipX,armTipY]],null,null,false); }
        function addTrim(g,a,b){ var t=g.addProperty("ADBE Vector Filter - Trim"); t.property("ADBE Vector Trim Start").setValue(a*100); t.property("ADBE Vector Trim End").setValue(b*100); }
        function arm(nm,dir){ var l=layer(comp,nm); var sl=SLEN[g.sleeve];
            var cf=grp(l,"cuff"); armPath(cf,dir); addTrim(cf, sl-0.045, sl); strk(cf, mul(TOP,0.70), 48);
            var sv=grp(l,"sleeve"); armPath(sv,dir); addTrim(sv,0,sl); strk(sv,TOP,42); strk(sv,INK,42+2*LW);
            var sk=grp(l,"skin"); armPath(sk,dir); strk(sk,SK,24); strk(sk,INK,24+2*LW);
            l.comment="CBLIMB tip="+(dir*armTipX)+","+armTipY+" bend="+(dir<0?1:-1);
            posL(l,[CX+dir*shX,TORSOY+2]); }
        arm("CB_Arm_L",-1); arm("CB_Arm_R",1);
        // hands (pale, at the wrists)
        function hand(nm,dir){ var h=layer(comp,nm); var v=grp(h,"g"); ell(v,[0,0],[42,50]); ell(v,[-16*dir,-9],[18,28]); fill(v,SK); strk(v,INK,LW*0.8); posL(h,[CX+dir*(A.sw+2),TORSOY+armLen]); }
        hand("CB_Hand_L",-1); hand("CB_Hand_R",1);
        // neck (short, tucked under collar)
        var nk=layer(comp,"Neck"); var nkv=grp(nk,"g"); rc(nkv,[0,0],[46,46],14); fill(nkv,SK); strk(nkv,INK,LW*0.9); posL(nk,[CX,TORSOY-22]); nk.comment="CBART chest";
        // face
        function faceSil(v){ ell(v,[0,0],[300,344]); }
        var fc=layer(comp,"Face"); var fcv=grp(fc,"g"); faceSil(fcv); fill(fcv,SK); strk(fcv,INK,LW); posL(fc,[CX,HEADY]); fc.comment="CBART head";
        if(g.shade!==false) shade(comp, fc, [
            [CX+66,551,150,150,SKIN_SH,60,100,BlendingMode.MULTIPLY],
            [CX-72,371,108,108,SKIN_HI,52,105,BlendingMode.SCREEN] ], "head");
        // facial hair (over face, under mouth)
        if(g.beard && g.beard!=="none"){ var FA=layer(comp,"Facial"); drawFacial(FA,g.beard,pal); posL(FA,[CX,HEADY]); FA.comment="CBART head"; }
        // features
        var FL=layer(comp,"Features"); drawMouthNose(FL,g.mouth,pal); posL(FL,[CX,HEADY]); FL.comment="CBART head";
        // Eyes on their own layer, anchored at eye level so auto-blink can
        // squash their height in place. Brows are a SEPARATE layer so the
        // blink doesn't squash them.
        var EL=layer(comp,"Eyes"); drawEyes(EL,g.eye,pal);
        EL.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0,EYEY]);
        posL(EL,[CX,HEADY+EYEY]); EL.comment="CBART head";
        if(g.blink){ EL.property("ADBE Transform Group").property("ADBE Scale").expression=blinkScaleExpr(); }
        var BR=layer(comp,"Brows"); drawBrows(BR,g.brow,pal); posL(BR,[CX,HEADY]); BR.comment="CBART head";
        var WL=layer(comp,"Eyewear"); drawEyewear(WL,g.wear,pal); posL(WL,[CX,HEADY]); WL.comment="CBART head";
        // hair front (skip when bald)
        if(g.hair!=="bald"){
            var hf=layer(comp,"HairFront"); var hfv=grp(hf,"g"); smooth(hfv,sc(HFRONT[g.hair],SF)); fill(hfv,HR); posL(hf,[CX,HEADY]); hf.comment="CBART head";
        }
        // hair sheen (matted to the back-hair mass)
        if(g.shade!==false && hb) shade(comp, hb, [
            [CX-120,300,90,150,HAIR_HI,30,90,BlendingMode.SCREEN] ], "head");
        // body pivots (nulls) for the rigger to build the hierarchy on
        // Body controllers (grabbable guide shapes, red label). Hips &
        // chest let you rotate/bend the torso; head is a ring whose PIVOT
        // sits at the neck (so a tilt swings the head naturally) while the
        // ring is drawn up around the head.
        function ctrlLayer(name,world,drawFn,noFill){
            var l=layer(comp,name); var v=grp(l,"Ctrl"); drawFn(v);
            strk(v,[0.90,0.25,0.20], noFill?9:4);
            if(!noFill){ var f=fill(v,[0.90,0.25,0.20]); try{ f.property("ADBE Vector Fill Opacity").setValue(12); }catch(e){} }
            l.guideLayer=true; l.label=1; posL(l,world); return l;
        }
        ctrlLayer("CB_Hips",[CX,legTop],function(v){ rc(v,[0,0],[150,44],10); });
        ctrlLayer("CB_Chest",[CX,TORSOY+30],function(v){ rc(v,[0,0],[120,40],10); });
        var headPivotY=TORSOY-24, ringDy=HEADY-headPivotY;
        ctrlLayer("CB_Head",[CX,headPivotY],function(v){ ell(v,[0,ringDy],[360,360]); }, true);
        // grit (over everything)
        if(g.grain!==false){
            var tex=comp.layers.addSolid([0.5,0.5,0.5],"FX_Grit",comp.width,comp.height,1); tex.adjustmentLayer=true; tex.moveToBeginning();
            var noise=tex.property("ADBE Effect Parade").addProperty("ADBE Noise"); try{ noise.property("ADBE Noise-0001").setValue(22); }catch(e){}
            opL(tex,50); tex.comment="CBART master";
        }
    }

    // ---------- choice/slot API (drives the panel) ----------
    // A "choice" is {slotKey: valueIndex} for all slots. The panel works in
    // indices + lock flags; choiceToG maps a choice to the g that build()
    // wants. SPECS is the de-duped eyewear list (WEAR has weighted repeats).
    var SPECS=["none","round","rectangle","wayfarer","roundshade"];
    var SLEEVES=["long","threeq","short"];
    var PAL_NAMES=[]; for(var pi=0;pi<PALS.length;pi++) PAL_NAMES.push(PALS[pi].name);
    var SLOTS_DEF=[
        {key:"palette",label:"Palette",vals:PAL_NAMES},
        {key:"body",   label:"Body",   vals:ARCHK},
        {key:"hair",   label:"Hair",   vals:HAIRS},
        {key:"eyes",   label:"Eyes",   vals:EYES},
        {key:"brows",  label:"Brows",  vals:BROWS},
        {key:"mouth",  label:"Mouth",  vals:MOUTHS},
        {key:"beard",  label:"Beard",  vals:FACIAL},
        {key:"specs",  label:"Specs",  vals:SPECS},
        {key:"top",    label:"Top",    vals:TOPS},
        {key:"sleeve", label:"Sleeve", vals:SLEEVES}
    ];
    function slotDef(k){ for(var i=0;i<SLOTS_DEF.length;i++) if(SLOTS_DEF[i].key===k) return SLOTS_DEF[i]; return null; }
    function choiceToG(ch, opts){
        opts=opts||{};
        var g={ seed:0, pal:ch.palette, arch:ARCHK[ch.body], hair:HAIRS[ch.hair],
            eye:EYES[ch.eyes], brow:BROWS[ch.brows], mouth:MOUTHS[ch.mouth],
            beard:FACIAL[ch.beard], wear:SPECS[ch.specs], top:TOPS[ch.top], sleeve:SLEEVES[ch.sleeve] };
        g.grain=(opts.grain!==false); g.shade=(opts.shade!==false); g.blink=(opts.blink===true);
        return g;
    }
    function randomChoice(rng){
        var ch={}; for(var i=0;i<SLOTS_DEF.length;i++){ var s=SLOTS_DEF[i]; ch[s.key]=Math.floor(rng.next()*s.vals.length); } return ch;
    }
    // reroll only the UNLOCKED slots of `base`; locked[key]===true keeps.
    function rerollChoice(base, locked, rng){
        var ch={}; for(var i=0;i<SLOTS_DEF.length;i++){ var s=SLOTS_DEF[i];
            ch[s.key]=(locked && locked[s.key]) ? base[s.key] : Math.floor(rng.next()*s.vals.length); }
        return ch;
    }
    // build straight from a choice into a comp (converts to g first).
    function buildChoice(comp, ch, opts){ build(comp, choiceToG(ch, opts)); }

    // ---------- API + main ----------
    $.global.CGEN={ PRNG:PRNG, roll:roll, build:build, PALS:PALS,
        SLOTS:SLOTS_DEF, choiceToG:choiceToG, randomChoice:randomChoice,
        rerollChoice:rerollChoice, buildChoice:buildChoice };
    if($.global.CB_NOAUTO) return;

    app.beginUndoGroup("Character Gen");
    var seed=($.global.CB_SEED!=null)?($.global.CB_SEED>>>0):(Math.floor(Math.random()*4294967295)>>>0);
    var g=roll(seed);
    var comp=app.project.items.addComp("CGEN "+seed,1000,1400,1,5,24);
    build(comp,g);
    comp.openInViewer();
    try{ var rf=new File(Folder.temp.fsName+"/cgen_result.txt"); if(rf.open("w")){rf.write("OK seed="+seed+" "+PALS[g.pal].name+"/"+g.eye+"/"+g.hair+"/"+g.wear+"/"+g.top);rf.close();} }catch(e){}
    app.endUndoGroup();
    if(!$.global.CB_QUIET) alert("Built character "+seed);
})();
}
