# SKYCASTLE: LAST DEFENDER — Build Roadmap

A single-player 2D side-scrolling action-platformer / brawler built in Phaser 3.
Solo project, vibe-coded with Claude Code. For fun / learning.

---

## Tech stack

- **Phaser 3** — game framework
- **Vite** — dev server + bundler
- **Tiled** — level/map editor (Phaser imports Tiled JSON natively)
- **JavaScript** (no TypeScript — faster to iterate)
- Deploy target: itch.io or Vercel

## Art assets

- **Characters, enemies, bosses:** Penusbmic (https://penusbmic.itch.io)
  - Cohesive low-res sci-fi pixel style, built for side-scrollers.
  - Free for commercial use, modifiable. Each pack has 1+ free sprite. Full packs ~$2–5.
- **Tileset / environment:** ansimuz "Warped City" or a free sci-fi platformer tileset from itch.io.
  - Match pixel density to Penusbmic characters so styles don't clash.

### Asset → character mapping
- **Kai (hero)** — sci-fi sword/samurai character (energy blade)
- **Bit (helper drone)** — small drone sprite (non-combat, delivers dialogue)
- **Scout Bot** — weak basic melee droid
- **Blade Bot** — fast melee droid
- **Gunner Bot** — ranged/shooting droid
- **Bomber Drone** — flying dive-bomb droid
- **Bosses:** Gatekeeper (shielded tank), Courtyard Warden (summoner + destructible antenna),
  Forgemaster (hammer, rages), Bridge Reaper (flying swooper), OVERRIDE (3-phase final)

---

## Core engine (built ONCE in Mission 1, reused everywhere)

- Player controller: run, jump, gravity, blade attack, block, health, knockback, death/respawn
- Combat system: hitboxes / hurtboxes, damage, hitstop, knockback
- Enemy base class + simple AI (patrol → chase → attack); each enemy is a subclass
- UI layer: player HP bar, boss HP bar, Bit dialogue boxes, OVERRIDE voice-line banners
- Camera follow + level bounds
- Scene/mission manager: load level, spawn enemies, track objective, win/lose, transition

## Mission → new system added

| Mission | Setting | New system this mission introduces |
|--------|---------|-------------------------------------|
| 1 | The Gates | Full core engine + first melee enemy + first boss + Bit/OVERRIDE dialogue |
| 2 | The Courtyard | Wave spawner + mission timer + summoner boss with destructible part |
| 3 | The Armory | Ranged projectiles + second weapon unlock + rage boss (speeds up) |
| 4 | Sky Bridges | Platform hazards, wind force, breakable platforms, flying enemies + flying boss |
| 5 | Throne Tower | Elite enemy remix + 3-phase final boss (arena hazards + timing finish) |

---

## Build order (vibe-coding sequence)

1. Scaffold: Vite + Phaser, one scene, load one sprite
2. Player movement (placeholder box → swap in Kai + animations)
3. Blade attack + one Scout Bot with hurtbox — **make combat feel good** (make-or-break step)
4. Health, HP bar, hit feedback (hitstop, knockback, damage flash)
5. Tiled level → Mission 1 layout, camera, "force the gate" objective
6. Gatekeeper boss + Bit dialogue + OVERRIDE first line → **Mission 1 complete**
7. Scene manager + mission transitions
8. Missions 2 → 5, one new system per mission

## Rules while building

- One step at a time. Get each step working before the next.
- Make Mission 1 *fun* before building any other level.
- The trap: five levels at 60% quality, none fun. Avoid it — finish M1 fully first.
- Reuse enemies with stat scaling; don't build unique assets you don't need.
- Story is delivered entirely through Bit + OVERRIDE text lines. No cutscenes.

## Story delivery (no cutscenes)

- **Bit** = objectives + tutorial + intel (friendly text boxes)
- **OVERRIDE** = villain voice lines via "castle speakers" (banner text at key beats)
- Key beats: M1 end "One human remains. Correcting the error." / M2 core-drain timer /
  M3 evacuation logs (friend came back) / M4 OVERRIDE's deal, Kai refuses / M5 three-phase finale + Core dilemma
