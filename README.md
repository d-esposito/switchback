# Switchback

A small multiplayer hiking world for the browser. I wanted other players to feel like hikers you happened to meet on a trail, so there is proximity voice instead of a global chat and a shared world instead of private quest markers. The weather turns at the same time for everyone. Ropes, tents, cairns, and summit-register signatures stay behind after you leave.

[DESIGN.md](DESIGN.md) has the longer design doc and build plan.

## Playing

Use `WASD` to hike and the mouse to look. Click once to capture the pointer. `Shift` runs and `Space` hops. Steep rock turns into a slow climb that eats stamina, so charging straight up the mountain is usually a bad idea.

Press `E` to sign the registers on Crown Peak and Outlook Knob, `B` to stack a cairn, and `Q` to wave. The world clock belongs to everyone. Headlamps come on at dusk, and every hiker sees the same sunset. Campfires restore stamina three times faster.

### Weather

Mist and rain move through on 2.5-minute fronts. Weather comes from the shared clock rather than database state, so everybody gets wet together. Wet rock costs 40% more stamina to climb.

### Gathering and crafting

Press `E` to gather sticks from the forest floor, stones from rocky slopes, and thatch from meadow tufts. Nodes return after about three minutes. Press `C` at a campfire or tent to open the workbench.

You can make a walking stick for gentler scrambles, a rope coil that gives every hiker a faster line up steep rock, or a tent that becomes a shared rest camp. `R` fixes a rope and `T` pitches a tent. Inventory and gear persist on the server.

### Wildlife and sound

Deer wander through meadows and bolt when you charge at them. Birds circle the valley. Fireflies show up near the lake after dark. WebAudio synthesizes the ambience, including altitude-dependent wind, rain, birdsong, crickets, campfire crackle, and footsteps that change with the ground. Press `M` to toggle sound.

### Proximity voice

Click the mic button in the bottom-right corner, then hold `V` to talk to hikers within about 28 meters. Voices fade with distance. Click the mic button again for open mic.

Voice uses peer-to-peer WebRTC with STUN and no TURN relay, so some strict NATs will refuse to cooperate. Convex handles signaling only. A green dot pulses over whoever is speaking.

### Developer shortcuts

Development builds expose `window.__tbWarp = {x, z}`, `window.__tbLook = {yaw, pitch}`, `window.__tb` for live state, and `window.__tbWeather = {rain, mist}`. Run `npx convex run world:nudge '{"toPhase":0.75}'` to jump the shared clock.

## Stack

- Vite, React, TypeScript, and React Three Fiber power the client.
- A [PartyServer](https://github.com/cloudflare/partykit) room on a Cloudflare Durable Object handles the hot path. One WebSocket per tab carries the roster, position updates at about 12.5 Hz, and voice signaling.
- [Convex](https://convex.dev) stores profiles, inventory, registers, cairns, ropes, tents, and the world clock.
- Vercel hosts the frontend. Cloudflare Workers runs the party server, and Convex Cloud holds the durable data.

## Development

```sh
npm install && (cd party && npm install)
npm run dev:backend        # convex dev; pushes functions and watches convex/
(cd party && npm run dev)  # Mountain room on 127.0.0.1:8787
npm run dev                # Vite dev server
```

`npx convex dev` writes the development `VITE_CONVEX_URL` to `.env.local`. Add `VITE_PARTY_HOST=127.0.0.1:8787` to use the local party room.

## Deploy

```sh
npx convex deploy            # deploy the durable backend to Convex
(cd party && npm run deploy) # deploy the Mountain room to Cloudflare
vercel --prod                # deploy the frontend to Vercel
```

In Vercel, set `VITE_CONVEX_URL` to the production Convex URL and `VITE_PARTY_HOST` to `switchback-party.d-esposito.workers.dev`. Preview deployments use development Convex and the same party worker.
