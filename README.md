# Switchback

Standup was boring as hell one day, so I made a tiny hiking game for my coworkers to wander around in while we talked. Screensharing works!

Then I added multiplayer. Then proximity voice. Then weather, climbing, campfires, crafting, deer, persistent cairns, and summit registers. It got a little out of hand.

[Play it here](https://switchback-game.vercel.app), or read the much more serious [design doc](DESIGN.md).

## How to hike

Use `WASD` to walk and the mouse to look around. Click the game once to capture the pointer. `Shift` runs and `Space` does a tiny hop.

Steep rock turns into a climb and chews through stamina. If you sprint straight at a cliff, you are probably going to slide back down looking stupid. Campfires refill stamina three times faster.

Press `E` to sign the summit registers on Crown Peak and Outlook Knob. `B` stacks a cairn. `Q` waves at whoever joined the call late.

### Weather

Everyone shares one world clock, so the sun sets for the whole group at once and headlamps kick on together. Rain and mist roll through in 2.5-minute fronts. Wet rock takes 40% more stamina to climb because apparently the mountain was not annoying enough.

Weather is calculated from the shared clock instead of stored in the database. Everyone sees the same storm without constantly writing rain updates to Convex.

### Gathering and crafting

Press `E` to pick up sticks in the forest, stones on rocky slopes, and thatch in meadows. They come back after about three minutes.

Press `C` at a campfire or tent to craft stuff:

- A walking stick makes scrambles less punishing.
- A rope coil lets you press `R` on steep rock and leave a faster route for everybody.
- A tent lets you press `T` and drop a shared rest camp.

Your inventory and gear stick around after you leave. So do the ropes, tents, cairns, and register signatures you leave in the world.

### Critters and noise

Deer wander through the meadows and run if you charge at them, which you will. Birds circle the valley. Fireflies show up around the lake at night.

All the sound comes from WebAudio. Wind changes with altitude, footsteps change with the ground, and the world picks up rain, birds, crickets, and campfire crackle as needed. Press `M` if your standup already has enough background noise.

### Talking to people

Screensharing is still the easiest way to pass the game around during a call. If everybody wants to join, there is proximity voice too.

Click the mic button in the bottom-right corner, then hold `V` to talk to hikers within about 28 meters. Volume drops with distance. Click the mic again for open mic.

Voice is peer-to-peer WebRTC with STUN and no TURN relay. Some strict NATs will simply say no. Convex only handles signaling. A green dot bounces over whoever is talking.

### Useful dev cheats

Development builds expose a few console helpers:

- `window.__tbWarp = {x, z}` teleports you.
- `window.__tbLook = {yaw, pitch}` points the camera.
- `window.__tb` dumps live state.
- `window.__tbWeather = {rain, mist}` changes the weather.
- `npx convex run world:nudge '{"toPhase":0.75}'` jumps the shared clock.

## What is running where

- Vite, React, TypeScript, and React Three Fiber run the game in the browser.
- A [PartyServer](https://github.com/cloudflare/partykit) room on a Cloudflare Durable Object handles the busy stuff. One WebSocket per tab carries the player list, position updates at about 12.5 Hz, and voice signaling.
- [Convex](https://convex.dev) remembers profiles, inventory, summit registers, cairns, ropes, tents, and the world clock.
- Vercel hosts the frontend. Cloudflare Workers runs the party server. Convex Cloud stores the stuff that needs to survive a refresh.

## Run it locally

```sh
npm install && (cd party && npm install)
npm run dev:backend        # push Convex functions and watch convex/
(cd party && npm run dev)  # run the Mountain room on 127.0.0.1:8787
npm run dev                # run Vite
```

`npx convex dev` writes the development `VITE_CONVEX_URL` into `.env.local`. Add `VITE_PARTY_HOST=127.0.0.1:8787` to use the local party room.

## Deploy it

```sh
npx convex deploy            # Convex
(cd party && npm run deploy) # Cloudflare
vercel --prod                # Vercel
```

Set `VITE_CONVEX_URL` to the production Convex URL in Vercel. Set `VITE_PARTY_HOST` to `switchback-party.d-esposito.workers.dev`. Preview deployments use development Convex and the same party worker.
