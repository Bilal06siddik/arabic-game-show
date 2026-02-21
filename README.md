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

Simple flow:

1. Host machine runs Cloudflare quick tunnel (`npm run tunnel:start`).
2. Script auto-starts the game server if needed.
3. Friends open the tunnel URL and join using room code.

### Host commands

```bash
npm install
npm run tunnel:start
```

This installs/checks `cloudflared`, auto-starts server on port `4000` if needed, then prints a public share URL.

Manual server start is still available:

```bash
npm run host:prod
```

Detailed guide: `docs/FRIEND_HOST_SETUP.md`.

## Scripts

```bash
npm run dev            # run web + server in dev
npm run dev:web        # web only
npm run dev:server     # server only
npm run host:prod      # build + start single-host mode
npm run host           # start server (expects built artifacts)
npm run tunnel         # interactive tunnel menu (start/stop/status)
npm run tunnel:start   # install/check cloudflared + auto-start host + print share URL
npm run tunnel:stop    # stop cloudflared (+ managed host if started by tunnel script)
npm run tunnel:status  # show current tunnel/host status + URL
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
