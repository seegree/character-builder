SHORT RUN parts pack

parts/<slot>/<ID>_<name>.svg   one part per file, flat, in its own frame.
  eyes, brows, mouths, noses, heads, ears, glasses, facial_hair: head-local frame, origin at the head centre.
  hair, accessories: head-local, authored on the reference head H1. Hair files have a "back" and a "front" group.
  shoes: origin at the ankle, left foot.
  bodies, tops, bottoms, hero_flat: whole character on the stage frame (spine x=0, chin y=240), one group per layer in z order.
Every path carries data-fill / data-stroke naming its palette role (skin, hair, top, bottom, accent, ink, stock, blush, lens).
The colours in the files are palette P1 Marmalade. Recolour by role from palettes.json. data-knockout marks shapes cut from the ink.
palettes.json  roles, area budgets, skin ramp.   finish.json  the print pass numbers and presets.   skeleton.json  attachment points and head frame.
The canvas is the reference; this pack is the same geometry as data.
