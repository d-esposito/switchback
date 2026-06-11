# Switchback

A cozy, browser-based, open-world 3D multiplayer hiking game. See [DESIGN.md](DESIGN.md)
for the full design doc and phased plan.

## Playing

WASD to hike, mouse to look (click to capture), Shift to run, Space to hop.
Steep rock becomes a slow, stamina-draining climb — arrive rested or you'll find
no purchase. E signs summit registers (Crown Peak, Outlook Knob), B stacks a
persistent cairn, Q waves. One shared world clock for everyone: headlamps come on
at dusk, the same sunset for every hiker. Campfires triple stamina regen.

**Weather** is derived from the shared clock (no DB state): mist and rain roll
through on 2.5-minute fronts, identical for every player. Wet rock makes
climbing drain 40% more.

**Gathering & crafting**: E gathers sticks (forest floor), stones (rocky
slopes), and thatch (meadow tufts) — nodes respawn after ~3 minutes. C at a
campfire or tent opens the workbench: walking stick (gentler scrambles),
rope coil (R fixes a line on steep rock that every hiker climbs faster), tent
(T pitches a shared rest camp). Inventory and gear persist server-side.

**Wildlife & sound**: deer wander the meadows and flee if you charge, bird
flocks circle the valley, fireflies rise near the lake at night. All ambience
is synthesized in WebAudio (wind by altitude, rain, birdsong, crickets,
campfire crackle, footsteps by surface) — M toggles sound.

**Proximity voice chat**: click the mic button (bottom right) to enable, then
**hold V to talk** to hikers within ~28m — volume falls off with distance.
Click the mic button again for open mic. Peer-to-peer WebRTC (STUN only, no
TURN relay — some strict NATs may not connect), with Convex used purely for
signaling; a green dot pulses over hikers who are speaking.

Dev console helpers (dev builds only): `window.__tbWarp = {x, z}`,
`window.__tbLook = {yaw, pitch}`, `window.__tb` (live state readout),
`window.__tbWeather = {rain, mist}`, and
`npx convex run world:nudge '{"toPhase":0.75}'` to jump the shared clock.

## Stack

- **Client**: Vite + React + TypeScript + React Three Fiber
- **Hot path**: [PartyServer](https://github.com/cloudflare/partykit) room on a
  Cloudflare Durable Object (`party/`) — one WebSocket per tab carries the
  roster, ~12.5 Hz position fan-out, and voice signaling
- **Durable data**: [Convex](https://convex.dev) (profiles, inventory,
  registers, cairns, ropes/tents, world clock)
- **Hosting**: Vercel (frontend) + Cloudflare Workers (party) + Convex Cloud

## Development

```sh
npm install && (cd party && npm install)
npm run dev:backend     # convex dev — pushes functions, watches convex/
(cd party && npm run dev)  # Mountain room on 127.0.0.1:8787
npm run dev             # vite dev server
```

`npx convex dev` writes `.env.local` with `VITE_CONVEX_URL` (dev deployment);
add `VITE_PARTY_HOST=127.0.0.1:8787` for the local party room.

## Deploy

```sh
npx convex deploy            # durable backend → Convex prod
(cd party && npm run deploy) # Mountain room → Cloudflare (personal account)
vercel --prod                # frontend → Vercel (scope: d-espositos-projects)
```

Vercel env: `VITE_CONVEX_URL` → Convex prod, `VITE_PARTY_HOST` →
`switchback-party.d-esposito.workers.dev` (preview env uses dev Convex but the
same party worker).
