/*
 * CharacterBuilder.jsx — the dockable After Effects panel.
 *
 * Translates the approved mock (mock/panel-mock.html) into ScriptUI and
 * wires it to the generator (CGEN) and rigger (CBRIG): per-slot cycle
 * arrows that auto-lock, a Generate that rerolls only unlocked slots,
 * Rig + Random pose, Grain/Shading toggles, and Seed behind Settings.
 *
 * Install: copy to  <AE>/Scripts/ScriptUI Panels/  and open from the
 * Window menu (docks). Or File > Scripts > Run Script File… (floats).
 *
 * DEV NOTE: this loads the generator/rigger modules from ./tools via
 * evalFile. A shipping build inlines them into this one file.
 * ES3 / ExtendScript.
 */
(function (thisObj) {

    // ---------- load modules ----------
    // Resolve ./tools relative to this script when possible.
    function toolsDir(){
        try{ var f=new File($.fileName); if(f && f.parent){ var t=new Folder(f.parent.fsName+"/tools"); if(t.exists) return t.fsName; } }catch(e){}
        return "/Users/chrisg/Documents/after-effects-cc/character-builder/tools"; // dev fallback
    }
    var TD=toolsDir();
    $.global.CB_NOAUTO=true;
    // Always (re)load so we pick up the current module API, not a stale
    // copy left on $.global by an earlier run in this AE session.
    $.evalFile(new File(TD+"/character_gen.jsx"));
    $.evalFile(new File(TD+"/rigger.jsx"));
    var CGEN=$.global.CGEN, CBRIG=$.global.CBRIG;
    if(!CGEN || !CBRIG){ alert("Character Builder: could not load generator/rigger from\n"+TD); return; }

    // ---------- state ----------
    var S=CGEN.SLOTS;
    var choice=null, locked={}, opts={grain:true, shade:true, blink:false}, charComp=null, rigged=false, lastSeed=0;
    function prng(seed){ return new CGEN.PRNG(seed>>>0); }
    function randSeed(){ return Math.floor(Math.random()*4294967295)>>>0; }
    function slotDef(k){ for(var i=0;i<S.length;i++) if(S[i].key===k) return S[i]; return null; }
    function ensureChoice(){ if(!choice){ lastSeed=randSeed(); choice=CGEN.randomChoice(prng(lastSeed)); } }

    // find-or-create the target comp; survive user deletion.
    function getComp(){
        if(charComp){ try{ var n=charComp.numLayers; return charComp; }catch(e){ charComp=null; } }
        for(var i=1;i<=app.project.numItems;i++){ var it=app.project.item(i);
            if(it instanceof CompItem && it.name==="Character"){ charComp=it; return it; } }
        charComp=app.project.items.addComp("Character",1000,1400,1,5,24); return charComp;
    }
    function rebuild(){
        app.beginUndoGroup("Character Builder: build");
        ensureChoice();
        var comp=getComp();
        while(comp.numLayers>0){ var ly=comp.layer(1); if(ly.locked) ly.locked=false; ly.remove(); }
        CGEN.buildChoice(comp, choice, opts);
        rigged=false;
        try{ comp.openInViewer(); }catch(e){}
        app.endUndoGroup();
    }
    function generate(){ ensureChoice(); lastSeed=randSeed();
        choice=CGEN.rerollChoice(choice, locked, prng(lastSeed)); rebuild(); }
    function cycle(key,dir){ ensureChoice(); var d=slotDef(key);
        choice[key]=(choice[key]+dir+d.vals.length)%d.vals.length;
        locked[key]=true; if(lockChecks[key]) lockChecks[key].value=true; rebuild(); }
    function doRig(){ var comp=getComp(); app.beginUndoGroup("Character Builder: rig");
        try{ CBRIG.rig(comp); rigged=true; }catch(e){ alert("Rig failed: "+e.toString()); } app.endUndoGroup(); }
    function doPose(){ var comp=getComp(); app.beginUndoGroup("Character Builder: pose");
        try{ if(!rigged){ CBRIG.rig(comp); rigged=true; } CBRIG.pose(comp, randSeed()); }catch(e){ alert("Pose failed: "+e.toString()); } app.endUndoGroup(); }
    function doIdle(){ var comp=getComp(); app.beginUndoGroup("Character Builder: idle");
        try{ if(!rigged){ CBRIG.rig(comp); rigged=true; } CBRIG.idle(comp); }catch(e){ alert("Idle failed: "+e.toString()); } app.endUndoGroup(); }
    function loadSeed(v){ lastSeed=v>>>0; choice=CGEN.randomChoice(prng(lastSeed));
        for(var k in locked) locked[k]=false; for(var kk in lockChecks) lockChecks[kk].value=false; rebuild(); }

    // ---------- UI ----------
    // Compact per jsx-design-principles.md: tight rows that each earn their
    // height, abbreviated labels, post-ops on one row, set-once prefs
    // (Grain/Shading/Blink/Seed) tucked into Settings, one accent action.
    var pal=(thisObj instanceof Panel)?thisObj:new Window("palette","Character Builder",undefined,{resizeable:true});
    pal.alignChildren=["fill","top"]; pal.spacing=2; pal.margins=6;

    var lockChecks={};
    for(var i=0;i<S.length;i++){ (function(slot){
        var row=pal.add("group"); row.orientation="row"; row.spacing=2; row.alignChildren=["left","center"];
        var nm=row.add("statictext",undefined,slot.label); nm.preferredSize=[58,18];
        var lb=row.add("button",undefined,"◀"); lb.preferredSize=[22,19]; lb.helpTip="Previous "+slot.label;
        var rb=row.add("button",undefined,"▶"); rb.preferredSize=[22,19]; rb.helpTip="Next "+slot.label;
        var lk=row.add("checkbox",undefined,undefined); lk.helpTip="Lock "+slot.label+" (kept on Generate)";
        lockChecks[slot.key]=lk;
        lb.onClick=function(){ cycle(slot.key,-1); };
        rb.onClick=function(){ cycle(slot.key,1); };
        lk.onClick=function(){ locked[slot.key]=lk.value; };
    })(S[i]); }

    // one accent action (full width), then post-ops on a single compact row
    var gen=pal.add("button",undefined,"Generate"); gen.preferredSize.height=30; gen.helpTip="Reroll every unlocked slot"; gen.onClick=generate;

    var post=pal.add("group"); post.orientation="row"; post.spacing=3; post.alignChildren=["fill","center"]; post.alignment=["fill","top"];
    var rigBtn=post.add("button",undefined,"Rig"); rigBtn.preferredSize.height=22; rigBtn.helpTip="Add IK controllers"; rigBtn.onClick=doRig;
    var poseBtn=post.add("button",undefined,"Pose"); poseBtn.preferredSize.height=22; poseBtn.helpTip="Rig if needed, then random pose"; poseBtn.onClick=doPose;
    var idleBtn=post.add("button",undefined,"Idle"); idleBtn.preferredSize.height=22; idleBtn.helpTip="Rig if needed, then breathing idle (tune/remove via the Idle slider on CB_Master)"; idleBtn.onClick=doIdle;
    var setBtn=post.add("button",undefined,"Set"); setBtn.preferredSize=[34,22]; setBtn.helpTip="Settings (Grain / Shading / Blink / Seed)";

    setBtn.onClick=function(){
        var w=new Window("dialog","Settings"); w.alignChildren=["fill","top"]; w.margins=14; w.spacing=8;
        var tgl=w.add("group"); tgl.orientation="row"; tgl.spacing=14;
        var cGrain=tgl.add("checkbox",undefined,"Grain"); cGrain.value=opts.grain;
        var cShade=tgl.add("checkbox",undefined,"Shading"); cShade.value=opts.shade;
        var cBlink=tgl.add("checkbox",undefined,"Blink"); cBlink.value=opts.blink;
        w.add("panel").preferredSize=[240,1]; // hairline separator
        var g=w.add("group"); g.add("statictext",undefined,"Seed");
        var e=g.add("edittext",undefined,String(lastSeed)); e.characters=14;
        var note=w.add("statictext",undefined,"Every Generate uses a fresh seed. Paste one to reproduce or share an exact character.",{multiline:true}); note.preferredSize=[240,44];
        var b=w.add("group"); b.alignment="right";
        var ok=b.add("button",undefined,"Apply"); var close=b.add("button",undefined,"Close");
        ok.onClick=function(){
            var changed=(cGrain.value!==opts.grain)||(cShade.value!==opts.shade)||(cBlink.value!==opts.blink);
            opts.grain=cGrain.value; opts.shade=cShade.value; opts.blink=cBlink.value;
            var v=parseInt(e.text,10);
            if(!isNaN(v) && (v>>>0)!==lastSeed){ loadSeed(v); }
            else if(changed){ rebuild(); }
            w.close();
        };
        close.onClick=function(){ w.close(); };
        w.show();
    };

    pal.layout.layout(true);
    pal.layout.resize();
    if(pal instanceof Window){ pal.center(); pal.show(); }

    // test hook: lets a headless harness drive the panel's actions.
    $.global.__CBPANEL={ generate:generate, cycle:cycle, rig:doRig, pose:doPose, idle:doIdle, rebuild:rebuild, loadSeed:loadSeed,
        setOpt:function(k,v){ opts[k]=v; }, state:function(){ return {choice:choice, locked:locked, seed:lastSeed, rigged:rigged}; } };

})(this);
