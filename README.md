# Trailbound (hiking-game)

A cozy, browser-based, open-world 3D multiplayer hiking game. See [DESIGN.md](DESIGN.md)
for the full design doc and phased plan.

## Playing

WASD to hike, mouse to look (click to capture), Shift to run, Space to hop.
Steep rock becomes a slow, stamina-draining climb — arrive rested or you'll find
no purchase. E signs summit registers (Crown Peak, Outlook Knob), B stacks a
persistent cairn, Q waves. One shared world clock for everyone: headlamps come on
at dusk, the same sunset for every hiker. Campfires triple stamina regen.

Dev console helpers (dev builds only): `window.__tbWarp = {x, z}`,
`window.__tbLook = {yaw, pitch}`, `window.__tb` (live state readout), and
`npx convex run world:nudge '{"toPhase":0.75}'` to jump the shared clock.

## Stack

- **Client**: Vite + React + TypeScript + React Three Fiber
- **Backend**: [Convex](https://convex.dev) (database, presence, world state)
- **Hosting**: Vercel (frontend) + Convex Cloud (backend)

## Development

```sh
npm install
npm run dev:backend   # convex dev — pushes functions, watches convex/
npm run dev           # vite dev server
```

`npx convex dev` writes `.env.local` with `VITE_CONVEX_URL` (dev deployment).

## Deploy

```sh
npx convex deploy     # backend → Convex prod
vercel --prod         # frontend → Vercel (scope: d-espositos-projects)
```

The Vercel project sets `VITE_CONVEX_URL` to the Convex **prod** deployment URL.
