# Friend Host Setup Guide

This setup is for private play where one friend hosts the game server.

Date context: updated on February 21, 2026.

## 1) Host Machine Requirements

- Windows/macOS/Linux machine that stays online during session.
- Node.js 22+ and npm 11+.
- Stable internet upload.

## 2) First-Time Setup (Host Only)

From project root:

```bash
npm install
npm run tunnel:start
```

What this does:

- Starts the game server on `http://localhost:4000` automatically if not running
- Installs `cloudflared` automatically if missing (Windows via `winget`)
- Starts a Cloudflare quick tunnel
- Prints a public `https://...trycloudflare.com` URL to share immediately
- Runs host/tunnel processes in background without opening extra console windows

The backend serves the frontend too, so friends only need one URL.

## 3) Fast Restart (Host)

Usually you only need:

```bash
npm run tunnel:start
```

Optional interactive menu:

```bash
npm run tunnel
```

This opens a terminal menu with `Start`, `Stop`, and `Status`.

Optional manual server start:

```bash
npm run host:prod
```

## 4) Share With Friends

Send the printed tunnel URL to friends, for example:

```text
https://something.trycloudflare.com
```

Then:

- Host creates a room.
- Friends open the link and join with the room code.

## 5) Stop Hosting

```powershell
npm run tunnel:stop
```

This also stops the host process if it was auto-started by `npm run tunnel:start`.

You can also check status any time:

```powershell
npm run tunnel:status
```

## 6) Host Runtime Tips

- Keep host laptop awake (disable sleep during game).
- Use Ethernet if possible for stability.
- Close heavy background uploads/downloads.

## 7) Common Problems

## `npm run tunnel:start` fails to auto-start local server

- Run `npm run host:prod` once and confirm build passes.
- Check logs in `.run/host.out.log` and `.run/host.err.log`.
- Check `http://localhost:4000/health` in browser.

## Friends cannot open tunnel URL

- Keep the host online and awake.
- Restart tunnel with `npm run tunnel:stop` then `npm run tunnel:start`.

## 8) Security Note

Anyone with your tunnel URL can open the site while tunnel is active.
Only share the link with your invited players and stop the tunnel after the session.
