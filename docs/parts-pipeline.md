# Design pack pipeline (`short_run_parts` → `character_gen.jsx`)

The character art is no longer hand-authored in ExtendScript. It's compiled
from the `short_run_parts/` design pack (108 SVGs + `skeleton.json` /
`palettes.json` / `finish.json`) by a one-time Python script, because
ExtendScript has no SVG parser and no `JSON.parse`.

## Regenerating

```
python3 tools/build_parts.py
```

Reads `short_run_parts/`, writes `tools/parts_data/*.jsx` (ES3 object/array
literals, committed to the repo). Run this whenever the design pack changes.
`character_gen.jsx` loads those files via `$.evalFile` at runtime — it never
touches the SVGs directly.

## What the compiler does

- Parses each `<path d="...">` (only absolute `M/L/C/Z` — the pack doesn't
  use arcs, relative commands, or quadratics) into AE vertex/inTangent/
  outTangent arrays.
- Reads `data-fill` / `data-stroke` (palette *role* names, not literal
  colors) and `data-knockout="1"` (always renders as the fixed `stock` color).
- Reverses SVG document order per group/path, because AE shape groups render
  first-created-in-front while SVG paints later-in-front.
- Emits one `.jsx` per category, keyed by the SVG's own id (`E01_pie`,
  `HF1_bob`, `B1` for bodies, etc).

## Category shapes

- **Simple / flat** (eyes, brows, mouths, noses, ears, glasses, facial_hair,
  accessories, shoes, heads): one flat ops array per part, ready to draw
  straight into a single AE shape layer.
- **Hair**: `{back:[...], front:[...]}` — two ops arrays, drawn as two
  separate layers straddling the head.
- **Bodies** (B1–B6): `{torso, pelvis, top, neckline}` ops, extracted
  directly from each body's own SVG — no retargeting, each archetype is
  hand-fit.
- **Garments** (tops, bottoms): all authored once against body B1. Each
  entry is `{id, overrides:{torso?,pelvis?,top?,neckline?}, extras:[{suffix,
  ops}]}`. An override value is either real ops (the garment's silhouette
  differs from B1's own body shape there) or the string `"omit"` (the
  garment's own art doesn't need that base-body group at all — e.g. a hoodie
  omits `neckline` because the hood covers it). `extras` are additive
  groups with no B1 counterpart (hood, collar, vest, hemband, bib, stripes,
  skirt, flare). Anything not overridden or replaced falls through to the
  *target* body's own base shape — only overrides/extras need retargeting
  when the chosen body isn't B1 (`character_gen.jsx`'s `retargetOps`, a
  two-region affine scale anchored at the neck and hip anchors from
  `skeleton.json`).
- **Palettes / finish / skeleton**: transcribed straight from JSON into ES3
  object literals — no path data involved.

## Known simplification

`finish.json` describes five texture mechanisms: `registration`,
`crescent`, `tooth`, `dropout`, `wobble`. `character_gen.jsx`'s
`applyFinish()` currently implements two of them for real (`tooth` as a
multiply-blend noise adjustment layer, `wobble` as a position `wiggle()`
expression on decorative — non-rig — layers), scaled by the finish.json
preset numbers. `registration`, `crescent`, and `dropout` are not
implemented yet; the four presets (OFF/LIGHT/HOUSE/HEAVY) still work, they
just carry less of the print-misregistration character than the full spec
describes. Worth a follow-up pass if the flat/simple result reads too clean.
