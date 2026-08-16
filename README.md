# Seikilos

A turn-based JRPG in the Chrono Trigger tradition: real-time ATB gauges, enemies
positioned on the field, and combo Techs that only become available when two or
three characters are ready at the same moment.

Built in TypeScript on a plain HTML5 canvas — no engine, no runtime
dependencies. Everything ships as static files.

## Running it

```bash
npm install
npm run dev        # opens http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (combat formulas, map validation) |
| `npm run typecheck` | Types only |
| `npm run smoke` | Play through the game in a real browser and screenshot it (needs `npm run dev` running) |

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Move, navigate menus |
| Z / Enter / Space | Confirm |
| X / Esc | Cancel, back |
| C / Tab | Pause menu |
| Shift | Run |

A standard gamepad works too.

## What's in the vertical slice

Walk out of the Wayside Camp, head south into the Sanctum of the Chorus, fight
your way through five encounters and take down Choragos at the bottom.

- **Field** — tile maps, 8-way movement, NPCs with flag-dependent dialogue,
  chests, save points, on-field enemies you can dodge or engage
- **Battle** — ATB gauges, single Techs, dual and triple combo Techs, items,
  defend, escape, status effects, positional area/line targeting, elemental
  affinities, level ups
- **Menus** — items, techs, status, equipment with stat-change preview, 3 save
  slots in `localStorage`

## The combo Tech system

This is the mechanic the whole battle design hangs off, so it's worth stating
plainly: a combo Tech appears in the menu only while **every** participant is
simultaneously ATB-ready, knows the component Techs, and can pay the MP.

That means spending a gauge the instant it fills costs you the combo. The
interesting decision in every fight is whether to act now or hold.

The top-level command menu deliberately does **not** pause the ATB, so you can
watch a partner's gauge fill and decide. Submenus and targeting do pause.

Combos live in `src/data/techs.ts` — a tech with two or three ids in `users` is
a combo, and `requires` lists the component techs each participant must know.

## Where things are

```
src/
  config.ts        Screen size, tile size, tick rate
  core/            Game loop, scene stack, input, assets, RNG
  render/          Canvas renderer, runtime-generated bitmap font
  data/            All content: actors, techs, enemies, items, encounters
  battle/          ATB engine, damage formulas, targeting, AI, effects
  field/           Tile maps, entities, the maps themselves
  ui/              Windows, list menus, dialogue boxes
  scenes/          Title, field, battle, pause menu, game over
  art/             Procedural placeholder art generator
  state/           Party, inventory, flags, save files
```

`docs/DESIGN.md` covers the design intent and what to build next.

## Adding content

Most changes are data edits, not code:

- **A new enemy** — add to `src/data/enemies.ts`, then reference it from an
  encounter in `src/data/encounters.ts`
- **A new tech** — add to `src/data/techs.ts` and put it in an actor's `learns`
  list in `src/data/actors.ts`
- **A new combo** — add a tech whose `users` lists two or three actor ids
- **A new map** — add an ASCII grid to `src/field/maps.ts`

`npm test` validates maps (row lengths, spawn points on walkable ground, exits
that land somewhere real, chests holding items that exist), so authoring
mistakes surface as test failures rather than a blank screen.

## Art

The game generates all its art procedurally at boot (`src/art/placeholder.ts`)
so it runs with zero downloads. Real artwork comes in through the importer.

### Importing a CC0 pack

| Command | What it does |
| --- | --- |
| `npm run assets:inspect -- --pack <id> --from <zip>` | Lists every PNG in the pack with its dimensions and cell grids, and writes **numbered contact sheets** to `shots/contact/` |
| `npm run assets:import` | Slices, remaps and writes `public/assets/`, plus the art manifest and `CREDITS.md` |
| `npm run assets:check` | Validates `assets.config.mjs` without writing anything |

The workflow:

1. Add the pack to `assets.config.mjs` (a homepage is enough; a URL is optional).
2. Run `assets:inspect`. Open the contact sheet — every cell is numbered.
3. Write those numbers into an output entry: `{ GRASS: 0, WALL: 60, ... }`.
4. Run `assets:import`.

Why it works this way: a pack ships tiles in whatever order its author chose,
and the engine wants them at specific semantic indices. Choosing *which* cell is
grass needs human eyes; everything after that is mechanical, so the importer
does it deterministically — same inputs, same bytes, so a re-import is an empty
diff unless something really changed.

Safety rails, because a shifted tile index silently rewrites every map:

- Tile **names** are parsed out of the `TILES` enum in the engine, so a typo or
  a drifted mapping fails the import instead of producing the wrong tile.
- Packs are **checksum-pinned** on first import; if upstream re-uploads a
  changed file, the import refuses rather than quietly remapping your world.
- Unmapped tiles come out **transparent** — a visible hole, not a wrong sprite.
- Anything not imported keeps its procedural placeholder, so a pack can be
  mapped a few tiles at a time.

Hand-written one-offs still go in `ART_MANIFEST` in `src/art/index.ts`, and take
precedence over imported entries.

### Where to get packs

- [Kenney](https://kenney.nl/assets) — CC0, no attribution required. *Tiny Town*
  and *Tiny Dungeon* are 16×16 and fit the current tile size directly.
- [OpenGameArt](https://opengameart.org) — filter by CC0. The LPC character
  sets are the standard choice for walk cycles.

Downloaded archives are cached in `.assets-cache/` (gitignored). The sliced
output in `public/assets/` is what gets committed, so a fresh clone needs no
downloads.

## Dev console

During `npm run dev`, `dev` is on `window`:

```js
dev.battle('boss.choragos')   // jump straight into any encounter
dev.warp('ruins', 21, 1)      // jump to a map
dev.level(12)                 // set party level
dev.give('phoenixLeaf', 5)
dev.heal()
dev.flag('choragosDefeated')
```
