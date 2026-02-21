# Arabic Game Show Platform

Monorepo for a live multiplayer game platform:

- `apps/web`: React + TypeScript client
- `apps/server`: Node + Express + Socket.IO server
- `packages/shared`: shared contracts and zod schemas
- `content`: game content datasets and board config
- `legacy/casino-static`: original static implementation preserved unchanged

## Quick Start (Development)

```bash
npm install
npm run dev
```

- Web (Vite): `http://localhost:5173`
- API/Socket: `http://localhost:4000`

## Friend Hosting (One of You Hosts)

The easiest flow for your use case:

1. Host machine runs one Node server.
2. That server hosts both frontend + API + Socket.IO on one URL.
3. Friends open that host URL and join rooms with room code.

### Host commands

```bash
npm install
npm run host:prod
```

This builds everything then starts server on port `4000`.

After first build, for faster restarts:

```bash
npm run host
```

Detailed guide: `docs/FRIEND_HOST_SETUP.md`.

## Scripts

```bash
npm run dev            # run web + server in dev
npm run dev:web        # web only
npm run dev:server     # server only
npm run host:prod      # build + start single-host mode
npm run host           # start server (expects built artifacts)
npm run build          # build all workspaces
npm run test           # server tests
npm run lint           # TS type checks
```

## HTTP APIs

- `POST /api/casino/rooms/create`
- `POST /api/bank/rooms/create`
- `POST /api/rooms/:code/join`
- `GET /api/rooms/:code/meta`
- `POST /api/rooms/:code/reconnect`

## Deployment (Optional Later)

Azure guide is kept for future use:

- `docs/AZURE_SETUP.md`