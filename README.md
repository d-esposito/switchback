# Trailbound (hiking-game)

A cozy, browser-based, open-world 3D multiplayer hiking game. See [DESIGN.md](DESIGN.md)
for the full design doc and phased plan.

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
