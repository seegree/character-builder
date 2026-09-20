# Rigging Notes

How Character Builder rigs a rubber-hose character: layer hierarchy,
the hose-IK expression contract, and coordinate conventions. The rig
spike (`tools/rig_spike.jsx`) is the reference implementation.

## Layer hierarchy

```
C_Master ─ C_Hips ─ Torso ─ C_Chest ─ C_Head ─ Head
         │                          ├ Arm_L ··· reaches for C_Hand_L
         │                          └ Arm_R ··· reaches for C_Hand_R
         │         ├ Leg_L ··· reaches for C_Foot_L
         │         └ Leg_R ··· reaches for C_Foot_R
         ├ C_Hand_L ─ Glove_L        (··· = expression link, not parenting)
         ├ C_Hand_R ─ Glove_R
         ├ C_Foot_L ─ Shoe_L
         └ C_Foot_R ─ Shoe_R
```

- All layers are shape layers; controllers (`C_*`) are custom-drawn
  shapes set as **guide layers** (never render) with the red label.
- **All artwork layers are locked** at build time so a stray click in
  the viewer can only ever grab a controller (user feedback: dragging
  the torso by accident reads as a broken rig). Unlock to edit art.
- Grabbability: controllers carry a 12%-opacity fill so their whole
  shape is a click target (stroke-only shapes are only clickable on
  the outline pixels). `C_Head` is the exception — a fill would tint
  the face — so it's a fat-stroked ring around the head instead:
  rotate to tilt, drag for cartoon neck-stretch.
- IK controllers are parented to `C_Master`, *not* to the body chain:
  moving the master moves everything; rotating hips/chest bends the
  body while hands and feet stay planted — which is exactly the
  rubber-hose gag you want.
- Hands and feet are parented to their controllers, so rotating a
  controller rotates the glove/shoe.

## The hose expression

Each limb is **one shape layer** whose path is rewritten every frame
by an expression on `Contents > Hose > Path`. There are no bone layers
and no elbow/knee joints — a rubber hose is a single bendy curve.

Contract (inputs the expression assumes):

| Input | Where | Meaning |
| --- | --- | --- |
| controller layer name | baked into the expression string | world-space target (wrist/ankle) |
| `Limb Length` slider | effect on the limb layer | hose length L, px |
| `Bend Dir` slider | effect on the limb layer | +1 / −1: which side the hose bows |

Geometry, computed in the limb layer's own space (layer anchor `[0,0]`
sits at the shoulder / hip joint):

1. `tgt = fromWorld(ctrl.toWorld([0,0]))` — target in layer space.
   Because this goes through world space each frame, any rotation of
   the torso/hips parent chain is automatically accounted for.
2. The hose **always reaches the controller**, even past its rest
   length — it stretches, cartoon-style. Clamping instead was tried
   first and detaches the glove/shoe (they're parented to the
   controller, which keeps going after the limb stops).
3. `sag = 0.5 * sqrt(max(L² − d², 0))` — chord-vs-length approximation
   of how far the middle of a hose of length L bows when its ends are
   `d` apart; zero (straight) once stretched taut. Not a true
   constant-arc-length solve, but visually right and cheap.
4. Mid-point = halfway to the target, displaced `sag` along the
   perpendicular, signed by `Bend Dir`.
5. `createPath()` (AE 15.0+) through root → mid → end with
   Catmull-Rom-ish tangents (`(next − prev) / 4`).

Gotchas encoded in the expression:

- **No unary minus on arrays** in AE expressions — `-vec` is NaN. Use
  a `neg()` helper or `vec * -1`.
- Guard `distance ≈ 0` before normalizing.
- The placeholder path set at build time is irrelevant; the expression
  owns the property.

## Coordinate conventions (build time)

- Every layer's anchor point is `[0,0]`; shape groups keep identity
  transforms. Geometry is drawn offset inside the layer instead
  (e.g. the torso layer sits at the hips and draws its ellipse at
  `[0,-110]`, so hip rotation pivots correctly).
- Scripted parenting does **not** preserve world position, so the
  builder sets `layer.parent` first, then sets position to
  `childWorld − parentWorld` (valid because the whole rig is built
  unrotated and unscaled).

## Shape-layer authoring facts (verified in AE 2026)

These bit us building the parts library and are easy to get wrong:

- **Group z-order: the FIRST group created renders in FRONT**, the last
  at the back. So draw front-to-back: e.g. eye highlight, then pupil,
  then white eyeball; hat band before the hat stack; face parts before
  the skull. (Verified with a two-circle render probe.)
- **Adding a group invalidates earlier group references** on the same
  layer ("ReferenceError: Object is invalid"). Finish drawing into a
  group before creating the next, and never touch a prior group's
  content reference again. Combined with the z-order rule this is
  natural: create each group, fill it, move on — front to back.
- **Stroke taper** is `ADBE Vector Stroke Taper` → `Start Width` /
  `End Width` (percent). Start 100 / End ~45 gives the thick-shoulder,
  thin-wrist rubber-hose limb. Wrap in try/catch (older AE lacks it).
- **Texture pass** uses an adjustment layer at the top of the stack:
  `ADBE Noise` (grain), `ADBE Roughen Edges` (rough ink), or
  `ADBE Turbulent Displace` (hand-drawn boil). All confirmed present.

## Known limitations / later work

- No pole vector — `Bend Dir` is a fixed ±1 per limb. Fine for hoses;
  revisit if a limb needs to flip mid-animation (could expression-link
  the sign to a checkbox on the controller).
- No stroke taper yet (`ADBE Vector Stroke Taper` group; add with
  try/catch since matchnames vary by AE version).
- Feet don't auto-rotate to the ground; rotate `C_Foot_*` manually.
- Torso is rigid; chest rotation hinges rather than bends it.

## Test checklist (run in AE after any rig change)

1. Drag each hand/foot controller through extremes: straight limb,
   full bend, crossing the body. No pops, no NaN flicker.
2. Rotate `C_Hips` and `C_Chest` ±30° — limbs stay glued to their
   sockets and keep reaching for their controllers.
3. Move `C_Master` — the entire character travels as one.
4. Scrub the timeline after keyframing controllers — expressions
   evaluate on every frame, no baked geometry.
5. Save, reopen the project — expressions still evaluate (layer names
   are the expression's only link; renaming a controller breaks its limb).
