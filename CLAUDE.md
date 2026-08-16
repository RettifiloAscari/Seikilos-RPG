# Working on Seikilos

A turn-based JRPG (Chrono Trigger-style ATB with combo Techs). TypeScript +
HTML5 canvas, Vite, no runtime dependencies.

Read `docs/DESIGN.md` for design intent before changing combat, and `README.md`
for layout and controls.

## Checks

```bash
npm run typecheck     # must pass
npm test              # combat formulas, content validation, asset pipeline
npm run build         # typecheck + production build
npm run smoke         # browser playthrough with screenshots (needs `npm run dev` running)
npm run assets:check  # validate assets.config.mjs
```

Run `typecheck` and `test` before committing. Run `smoke` after touching input,
rendering, the scene stack, or battle UI layout — it catches things unit tests
structurally cannot, and the screenshots in `shots/` are the fastest way to see
a panel that has drifted on top of another.

## Conventions

- **Content is data.** New enemies, techs, items, encounters and maps go in
  `src/data/` or `src/field/maps.ts`. If adding content requires editing the
  battle engine, the data model is missing something — extend the model.
- **The engine never draws.** `src/battle/battle.ts` emits `BattleEvent`s;
  `src/scenes/battle.ts` turns them into visuals. Keep that split.
- **Combat maths lives in `src/battle/formulas.ts`**, pure and unit tested.
  Tune there, not at call sites.
- **Assets are looked up by stable string key** (`actor.kairos.battle`). Real
  art overrides a placeholder by registering under the same key; no gameplay
  code should ever reference a file path.
- **`src/art/manifest.generated.ts` is generated.** Edit `assets.config.mjs` and
  re-run `npm run assets:import`; hand edits are overwritten. One-off art that
  isn't sliced from a pack goes in `ART_MANIFEST` in `src/art/index.ts`.
- Fixed 60Hz logic tick. Never scale gameplay by frame time outside the tick.
- Virtual resolution is 384×216, scaled by an integer factor. Draw in virtual
  pixels and round positions; sub-pixel sprites shimmer.

## Traps worth knowing

- **Input is edge-buffered, not sampled.** A key pressed and released inside one
  1/60s frame must still register, so `pressed()` reads a buffer filled by DOM
  events rather than comparing held-state between ticks. Don't "simplify" it
  back to state comparison.
- **The scene stack mutates deferred.** `push`/`pop` during `update` queue up and
  apply after, so a scene can safely change the stack from inside itself.
- **Battle UI must stay clear of the HUD** along the bottom (y ≥ 158) and of the
  party sprites on the left. The geometry constants at the top of
  `src/scenes/battle.ts` exist to keep that honest.
- **Combo tech availability is recomputed live** every time the tech menu opens.
  It depends on who is ready *at that instant* — that's the mechanic, not a bug.

## Style

Match the surrounding code. Comments explain *why* a thing is the way it is,
particularly where a value was tuned or a subtlety would otherwise be re-broken;
they don't restate what the line does.
