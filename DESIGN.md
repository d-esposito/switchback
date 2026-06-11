# Switchback — Design & Technical Plan

> **Status (June 2026):** Phases 2–4 are live. Shipped: seeded open world
> (Crown Peak + Outlook Knob + lake + fire lookout), hiker controller with
> stamina + scramble + summit-wall climbing, shared day/night clock with
> headlamps, clock-derived shared weather (mist/rain fronts, wet-rock climbing),
> campfire regen, summit registers with live signatures, persistent cairns,
> resource gathering (sticks/stones/thatch) + crafting (walking stick, shared
> rope lines, shared tents), ambient wildlife (deer/birds/fireflies),
> synthesized WebAudio ambience + footsteps, wave emote, multiplayer presence
> at ~5 Hz, wilderness-permit login + trail-artifact HUD.
> Backlog: photo mode + journal, peak badges on packs, ranger quests, daily
> challenges, proximity chat bubbles, map UI, fast travel, more peaks/biomes,
> TURN relay for strict-NAT voice peers (Cloudflare Realtime TURN key).
>
> **Architecture (June 2026):** hot/cold split. The hot path (presence
> roster, ~12.5 Hz positions, voice signaling) rides one WebSocket per tab
> to a PartyServer Durable Object on Cloudflare (`party/`). Convex keeps
> everything durable. Voice chat is LIVE again: mesh WebRTC, mic-gated
> connections (no signaling unless a side has a live mic), 30s backoff on
> failures, batched ICE — signaling never touches the Convex mutation queue.

*Named **Switchback** (early prototypes used the working title "Trailbound").*

A cozy, browser-based, open-world 3D multiplayer hiking game. You arrive at a mountain
valley as a customizable little hiker, and the whole game is the mountain: walking trails,
scrambling up rock, managing stamina, watching the sun set from a summit, and running into
other real players doing the same thing.

**Design pillar: the mountain is the boss.** No combat, no death, no PvP. All difficulty
comes from terrain, stamina, weather, and route-finding. All multiplayer interaction is
positive-sum (you can help other players, never hurt them).

---

## 1. The core fantasy

- You log in, customize your hiker, and spawn at a trailhead in a shared persistent world.
- Other real players are visible hiking around you — headlamps dotting the valley at night,
  silhouettes on distant ridgelines, a stranger waving from a summit.
- Short sessions are satisfying (hike a loop, find a collectible), long arcs exist
  (gear up and summit the big peak in a weather window).
- Tone: Journey's wordless warmth + A Short Hike's coziness + PEAK's stamina-climbing tension.

## 2. Gameplay mechanics

### Movement & stamina (the core loop)
- Third-person controller: walk (free), run / jump / climb (drain stamina ring, Zelda/PEAK style).
- Stamina regenerates when idle/walking, faster when sitting, fully at campfires.
- Slope tiers: walkable → scramble (slow, light drain) → climbable rock (hold-to-climb,
  heavy drain) → sheer (needs gear).
- No death: deplete stamina mid-climb and you slide/fall, "twist an ankle" (temporary slow),
  or black out and wake at your last campfire. Failure costs time, not progress.

### Climbing
- Slope-based: terrain steeper than walk-angle becomes scramble; flagged rock-face meshes
  are climbable freeform with stamina drain (the PEAK mechanic — route-planning between
  rest ledges is the puzzle).
- Gear extends it: rope (place a fixed line **other players can use** — co-op!), grappling
  hook late-game, chalk for slower drain.

### Day/night cycle & weather
- Server-synced clock: one game day ≈ 30 real minutes, same time of day for every player.
  Shared sunsets become natural social events — everyone drifts toward summits at golden hour.
- Night: stars/constellations (navigation flavor), fireflies, headlamps visible from far away.
- Weather (later phase): fog, rain, wind; storms above treeline push players to shelter —
  gives camping a purpose. Rainbows after rain.

### Camping
- Campfires at designated sites (and craftable ones later): stamina regen aura, sit emote,
  marshmallow roasting, chat-bubble gathering spot. The social hub of the game.
- Sleeping at a tent sets your respawn and (solo) skips to dawn.

### Objectives & waypoints
- **Summit registers**: every named peak has a logbook you sign — and you see real
  signatures of every player who's summited. Cheap to build, huge "alive world" feeling.
- **Peak badges**: each summit awards a patch displayed on your backpack — visible status
  cosmetics other players can read at a glance.
- **Vista points**: marked overlooks that trigger photo mode + journal entry.
- **Cairns**: players stack stones anywhere; they persist in the world for everyone
  (Death Stranding-style asynchronous multiplayer). Cap density to avoid clutter.
- **Ranger quests**: light fetch/find quests from an NPC ranger station ("a hiker dropped
  their journal near Marmot Pass").
- **Daily challenge**: "Watch sunrise from Eagle Point", "Summit in the rain" — one per day,
  shared by all players, cosmetic rewards.

### Crafting & gear (kept light — it's a hiking game, not Minecraft)
- Forage on-trail: berries, flint, wood, fibers, mushrooms.
- Craft at campfires: trail mix (stamina food), rope, headlamp, better boots (scree/mud
  speed), trekking poles, tent, camera film.
- Gear gates terrain naturally (no artificial walls): the big summit needs rope + headlamp
  + a weather window. That's the endgame arc.

### Collection & ambient life
- Photo mode with a journal: photo challenges (capture a deer, sunrise from the lookout).
- Wildlife: ambient deer/birds/marmots that flee if you run — rewards walking calmly.
  Birdwatching checklist. A rare mountain goat that leads you to secrets.
- Collectibles: feathers, pressed flowers, lost postcards.

### Social layer
- Emotes: wave, **point** (crucial for wordless coordination), sit, photo pose, chirp sound.
- Proximity text chat as speech bubbles (opt-out), no global chat initially.
- Name tags fade in only at close range; distant players are anonymous silhouettes.
- Anti-grief by design: no collision pushing, no PvP, interactions are help-only.

### The world
- One handcrafted-feeling region, roughly 2×2 km, altitude-banded biomes:
  meadow valley (spawn/social hub) → pine forest → alpine meadow → scree & snow summits.
- Landmarks: lake, waterfall canyon, hot spring (stamina buff + social magnet), abandoned
  fire lookout, small cave/mine, 4–5 named peaks of escalating difficulty, one final
  big peak ("the Crown") as the long-term goal.
- Trail map UI that un-fogs as you explore; fast travel via shuttle stops you've already
  reached on foot.

## 3. Technical architecture

### Stack
| Layer | Choice | Why |
|---|---|---|
| Rendering | Three.js via React Three Fiber + drei | Biggest ecosystem, declarative, easy LOD/instancing helpers |
| App/build | Vite + TypeScript + zustand | Fast iteration, simple state |
| Frontend hosting | Vercel | Free tier, zero-config, preview deploys |
| Backend (persistence + realtime) | **Convex** | Single vendor for auth, DB, reactive subscriptions, scheduled functions; generous free tier; reactive queries map perfectly onto "see other players' state" |
| Physics | Custom kinematic capsule controller (raycast ground-snap against heightmap) | Deterministic, cheap; full physics engine is overkill for hiking. Add @react-three/rapier later only if needed |
| Assets | Kenney nature kits, Quaternius animated characters (CC0), Mixamo animations | Coherent stylized low-poly look, no artist needed, small downloads |
| Audio | Howler.js / three positional audio | Ambient layers per biome + time of day |

### Aesthetic = performance strategy
Stylized low-poly with flat shading and vertex colors: looks intentional, loads fast,
runs at 60fps on mid laptops, and lets fog (which we want aesthetically anyway) hide
the draw distance. Instanced trees/rocks/grass, chunked terrain with LOD.

### Terrain
- Seeded simplex-noise heightmap, generated in chunks, deterministic from a world seed —
  **every client generates identical terrain from one number**, so the server never ships
  geometry. Hand-author landmark overrides (peaks, lake, lookout) as stamped masks on
  top of the noise.
- Vertex-color biomes by altitude + slope; slope angle drives walk/scramble/climb tiers.

### Multiplayer model
- **Topology**: one shared world, soft-capped ~20–30 players per instance; overflow spawns
  parallel instances. Friends can pick the same instance via shareable link.
- **Netcode**: client-authoritative positions (fine for a cozy co-op game — there's nothing
  to cheat at), updates sent only-while-moving at **3–5 Hz**, remote players rendered with
  a ~200ms interpolation buffer + animation-state blending. Hiking is slow; this looks
  smooth and is dirt cheap.
- **Convex shape**: `profiles` (cosmetics, inventory, peak log), `presence` (position,
  rotation, anim state, heartbeat; cleaned by scheduled function), `cairns`, `signatures`,
  `photos`, `worldClock` (server time → shared day/night).
- **Interest management**: subscribe only to presence rows in your chunk-neighborhood
  once player counts demand it.

### Honest free-tier math & the scaling path
Convex's free tier meters function calls. At 5 Hz, one moving player ≈ 18k mutations/hour,
so sustained traffic burns through ~1M calls/month faster than "generous" suggests.
Mitigations, in order: send only-while-moving, drop to 3 Hz (fine with interpolation),
batch position+anim into one mutation. If the game actually gets traction, the clean
split is: keep Convex for persistence/auth/world-state and move the hot position-relay
path to a tiny WebSocket room service (PartyKit / Cloudflare Durable Objects — also a
generous free tier). The architecture should keep "position relay" behind one small
module so this swap is painless. **Don't build that now** — Convex-only is the right
phase-2/3 call for simplicity.

### Auth
Near-zero friction: anonymous device token (auto-created, stored locally) + chosen
display name. Optional OAuth via Convex Auth later to carry progress across devices.

## 4. Phased plan

### Phase 1 — Single-player prototype (local)
Goal: *walk from the valley to one summit at sunset, and it feels good.*
- Vite + TS + R3F scaffold; chunked seeded terrain with biome colors + instanced props
- Third-person capsule controller: walk/run/jump, slope tiers, scramble
- Stamina ring; basic hold-to-climb on steep rock
- Day/night cycle (sun position, sky gradient, stars, fog)
- Character customization screen (body colors, hat, backpack) → localStorage
- One summit with a register, one campfire that restores stamina
- Animated character (Quaternius/Mixamo: idle, walk, run, climb, sit)

### Phase 2 — Deployed, one player
Goal: *a URL anyone can open; progress persists.*
- Convex project: anonymous auth, profile/customization/position/peak-log persistence
- Server-synced world clock (everyone shares the same sunset — sets up phase 3)
- Frontend deployed on Vercel, Convex deployed; env wiring, loading states

### Phase 3 — Multiplayer prototype
Goal: *two browsers wave at each other on a summit.*
- Presence: join/leave/heartbeat, throttled only-while-moving position updates
- Remote player rendering: interpolation buffer, anim blending, fade-in name tags
- Emotes (wave, point, sit); summit register shows real player signatures
- Cairn placement, persisted and visible to all
- Instance soft-cap + shareable instance link

### Phase 4 — The game
- Full region: 4–5 named peaks, lake, hot spring, fire lookout, cave, final big summit
- Crafting + gear (rope lines usable by others, headlamp, boots, tent), foraging
- Weather system; storms that matter above treeline
- Photo mode + journal, badges on backpacks, daily challenge, ranger quests
- Proximity chat bubbles, ambient wildlife, audio layers, map UI, fast travel
- Performance + polish passes; cut ruthlessly based on what playtests fun

## 5. Scope guardrails
The vertical slice that proves the game: **walk + climb + stamina + one summit +
shared day/night + campfire + seeing other players**. Everything else (weather, crafting,
wildlife, quests) is layered on after that slice is fun. If the slice isn't fun, no
amount of features fixes it.
