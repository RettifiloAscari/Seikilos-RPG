# Design notes

Running document for what this game is and what to build next. Nothing here is
final; it exists so decisions stay decided instead of getting relitigated every
session.

## The pitch

A turn-based JRPG about a dead civilisation that never stopped singing. The
oldest complete piece of written music in the world is the Seikilos epitaph, cut
into a gravestone around two thousand years ago, and its text is four lines
long:

> While you live, shine
> have no grief at all
> life exists only for a short while
> and time demands its toll

That's the game's thesis and its title. Music is the world's memory: songs
outlast the people who sang them, and something in the ruins is still keeping
time.

*(The placeholder cast and script are a scaffold to hang systems on, not a
locked story. Rename and rewrite freely — everything is in `src/data/` and
`src/field/maps.ts`.)*

## Influences and what we're taking from each

| Source | What we're taking |
| --- | --- |
| Chrono Trigger | ATB, no separate battle screen, enemies positioned on the field, **combo Techs** |
| Final Fantasy VI/VII | Status effect depth, equipment that changes how a character plays |
| Xenogears / Legaia | Combos as a thing you *build*, not just select |
| Final Fantasy III | Clear character roles worth swapping between |

The one non-negotiable is the combo Tech system. Everything else is negotiable.

## Combat design

**ATB.** Gauges fill in real time from SPD. SPD 10 is about four seconds per
turn, SPD 40 about two (`atbRate` in `src/battle/formulas.ts`).

**Combo Techs are the core loop.** A combo appears only while every participant
is simultaneously ready. This creates a live tension the player feels every few
seconds: *act now with the gauge I have, or hold it and hope the other gauge
fills before the enemy acts?*

Two rules protect that tension and should not be casually changed:

1. The top-level command menu does **not** pause the ATB. If it did, waiting for
   a partner would be free and the decision would evaporate.
2. Submenus and targeting **do** pause. Menu-fumbling shouldn't cost HP.

**Positional targeting.** Enemies stand at authored coordinates in each
encounter. `areaEnemies` hits everything within a radius of the aimed-at enemy;
`lineEnemies` hits everything in a horizontal band. This makes encounter
*layout* a design tool — `ruins.line` exists purely to reward Twin Cadence.

**Damage.** `power/100 × attack × (100/(100+defense))`, then crit, guard,
variance and elemental affinity. Defense scales hyperbolically so stacking it
has diminishing returns and damage can never be reduced below 1. All of it is
in `formulas.ts` with unit tests; tune there.

**Status durations are in seconds, not turns.** In an ATB system there is no
global turn, and seconds mean a fast character gets more actions inside the same
poison — which is the right trade-off.

## Content pipeline

The rule: **anything a designer changes should be data, not code.** New enemies,
techs, items, encounters and maps are all plain objects in `src/data/` and
`src/field/maps.ts`.

Maps are ASCII grids. `npm test` validates them, so a mistyped row or a chest
holding a renamed item fails a test instead of producing a blank screen.

## Current state

Playable vertical slice: two maps, five encounters plus a boss, three
characters, three dual techs, one triple tech, ten status effects, saves.

## What to build next

Roughly in order of how much each one improves the game per unit of work.

**1. Sound.** The single biggest perceived-quality jump per hour spent, and this
game is *about* music. Needs an audio manager, a handful of CC0 effects
(hit, heal, menu move, menu confirm, victory) and two or three tracks. Note the
browser autoplay policy: audio can't start until the player interacts.

**2. Real art.** The pipeline is ready (`src/art/index.ts`). Kenney *Tiny Town*
and *Tiny Dungeon* are CC0 16×16 and drop straight in.

**3. More combos.** The system supports far more than the four that exist. Every
new pair is cheap content with high impact. Combos gated behind story beats are
a good reward structure.

**4. A town with a shop.** Shops make gold meaningful, which makes drops
meaningful. The menu framework already covers most of the UI work.

**5. Party swapping.** `GameState` already separates `roster` from `activeIds`;
the UI to swap them is missing. Only interesting once there are more than three
characters, so it pairs with recruiting a fourth.

**6. Cutscene scripting.** A small command list (move entity, face, wait, say,
set flag, fade) interpreted by the field scene. Needed before the story can
actually be told rather than delivered by standing NPCs.

### Deliberately not doing yet

- **Multiple simultaneous actions.** Chrono Trigger resolves one action at a
  time and so do we. Overlapping resolution is a large complexity jump.
- **Enemies migrating on the field mid-battle.** CT did this; it interacts
  badly with positional targeting unless the cursor updates live.
- **An in-game map editor.** ASCII grids are fine at this scale. Revisit past
  roughly a dozen maps.

## Open questions

- How many party members total? Three works; six means party swapping,
  reserve-EXP rules and a lot more combos to author.
- Does MP stay, or do Techs run off a shared resource that rewards combos
  directly?
- Are combos discovered or taught? Discovery is more magical; teaching is easier
  to signpost.
