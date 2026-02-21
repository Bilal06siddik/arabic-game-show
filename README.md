# Arabic Game Show Platform

Monorepo for a live multiplayer game platform:

- `apps/web`: React + TypeScript client
- `apps/server`: Node + Express + Socket.IO server
- `packages/shared`: shared contracts and zod schemas
- `content`: game content datasets and board config
- `legacy/casino-static`: original static implementation preserved unchanged

## Quick Start

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173`
- API/Socket server: `http://localhost:4000`

## Scripts

```bash
npm run dev          # run web + server
npm run dev:web      # web only
npm run dev:server   # server only
npm run build        # build all workspaces
npm run test         # server tests
```

## HTTP APIs

- `POST /api/casino/rooms/create`
- `POST /api/bank/rooms/create`
- `POST /api/rooms/:code/join`
- `GET /api/rooms/:code/meta`
- `POST /api/rooms/:code/reconnect`

## Deployment

Azure deployment guide: `docs/AZURE_SETUP.md`.