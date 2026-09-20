# Character Builder

An After Effects ScriptUI panel that generates fully rigged,
ready-to-animate rubber-hose characters — one-click, exquisite-corpse
style: every Generate is a surprising new character; per-part locks
keep what you love while the rest re-rolls.

**Status: Milestone 2 (genome + parts library).** No panel yet, but
`tools/character_builder.jsx` is a data-driven builder: a seeded genome
picks head / eyes / mouth / hat / torso / gloves / shoes / palette plus
jittered proportions, and `buildCharacter(genome)` produces a fully
rigged character. Run it directly to build one random character.

## Try the builder

1. In After Effects: **File > Scripts > Run Script File…** and pick
   `tools/character_builder.jsx` (AE 15.0 / CC 2018+).
2. A comp **CB &lt;seed&gt;** opens with a random rigged character.
3. Drag `C_Hand_L/R`, `C_Foot_L/R`, `C_Head`; rotate `C_Hips`/`C_Chest`;
   move `C_Master`. Run again for a new character.

Force a seed / lock parts / add texture by setting globals first
(see the header of `character_builder.jsx`): `CB_SEED`, `CB_LOCKS`
(e.g. `"palette|legs"`), `CB_TEXTURE` (`grain`|`rough`|`boil`).

`tools/rig_spike.jsx` remains as the milestone-1 single hard-coded rig.

## Repo layout

- `tools/character_builder.jsx` — genome + parts library + rig (the core)
- `tools/rig_spike.jsx` — milestone-1 spike: one hard-coded rigged character
- `docs/rigging-notes.md` — hierarchy, hose-IK contract, shape-layer facts, test checklist
- `docs/jsx-design-principles.md` — panel design philosophy and ScriptUI gotchas
- (coming) `mock/panel-mock.html`, `CharacterBuilder.jsx`, `tools/generate_icons.py`

## Roadmap

1. ✅ Rig spike — expression IK, bendy `createPath()` limbs, controllers
2. ✅ Genome + parts library — seeded shuffle, variants, palettes, texture, locks
3. HTML mock of the panel (mock-first, per design principles)
4. ScriptUI panel wired to the builder, per-part lock tiles
5. Random poses, auto-blink, idle bounce (walk cycle deferred)
6. Face variation, icons, install polish
