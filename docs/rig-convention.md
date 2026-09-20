# Rig Convention

The rigger (`tools/rigger.jsx`) is art-agnostic: it rigs **any** comp whose
layers follow this naming/tagging convention. The generator emits it
automatically; you can also hand-build a character in AE (or import +
organize from Illustrator, à la Overlord) and rig it the same way.

`CBRIG.rig(comp)` walks the comp, finds the tagged layers, and builds the
controllers + IK expressions + hierarchy. Nothing about *how* a layer is
drawn matters — only its name (for the structural roles) or its `comment`
tag (for generic art).

## Structural layers (matched by name prefix)

| Layer name | Role |
| --- | --- |
| `CB_Master` | Root move/scale control. Created at the feet if absent. |
| `CB_Hips` | Lower-body pivot. |
| `CB_Chest` | Upper-body pivot. |
| `CB_Head` | Head pivot; also gets a grab-ring controller. |
| `CB_Arm_L` / `CB_Arm_R` | Bendy hose limb. **Anchor at the shoulder joint**, art drawn from `[0,0]` outward to the wrist at rest. |
| `CB_Leg_L` / `CB_Leg_R` | Bendy hose limb. **Anchor at the hip joint**, art from `[0,0]` to the ankle. |
| `CB_Hand_L` / `CB_Hand_R` | Hand art; parented to the matching arm's controller. |
| `CB_Foot_L` / `CB_Foot_R` | Foot art; parented to the matching leg's controller. |

### Limb tag (on the limb layer's `comment`)

```
CBLIMB tip=<x>,<y> bend=<±1>
```

- `tip` — the wrist/ankle offset in the limb layer's own space at rest
  (so the rigger knows the rest length and where to place the controller).
- `bend` — `+1` / `-1`: which way the hose bows when slack.

## Generic art layers (matched by `comment` tag)

Any other layer carries `CBART <region>` where region is one of
`master | hips | chest | head`. The rigger parents it to that pivot, so it
travels/rotates with the right body part. Untagged layers are left alone.

## What the rigger builds

- A **hose-IK expression** on every path in each limb layer: the limb
  reaches from its joint (layer anchor `[0,0]`) toward its controller and
  bows by `bend`, stretching to always meet the controller — the classic
  rubber-hose bend. Controllers are guide layers (never render).
- **Hierarchy:** `CB_Master → CB_Hips → CB_Chest → CB_Head`; arms parent to
  `CB_Chest`, legs to `CB_Hips`; each hand/foot to its limb controller; each
  controller to `CB_Master`. So dragging a hand bends that arm; rotating the
  chest bends the upper body while the hands stay put; moving the master
  moves everyone.
- Controllers exposed: `CB_Master`, `CB_Hips`, `CB_Chest`, `CB_Head`,
  `*_CTRL` per limb. (Blink/look face controls: a later pass.)

## Contract notes

- Expressions link **by layer name** — renaming a limb or its controller
  breaks the link. The rigger names controllers `<LimbName>_CTRL`.
- Limbs must be **anchored at the joint** with rest art from `[0,0]`; a limb
  drawn in body-composite space won't rig correctly (the hose math assumes
  the root is the layer origin). See `tools/rig_spike.jsx` for the reference
  single-character build.
