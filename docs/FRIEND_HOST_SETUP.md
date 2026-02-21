# Friend Host Setup Guide

This setup is for private play where one friend hosts the game server.

Date context: prepared on February 20, 2026.

## 1) Host Machine Requirements

- Windows/macOS/Linux machine that stays online during session.
- Node.js 22+ and npm 11+.
- Stable internet upload (or same LAN/Wi-Fi for local play).

## 2) First-Time Setup (Host)

From project root:

```bash
npm install
npm run host:prod
```

Server starts on:

- `http://<HOST_IP>:4000`

The backend now serves the frontend too, so friends only need one URL.

## 3) Fast Restart (Host)

After first build:

```bash
npm run host
```

## 4) Same Wi-Fi / LAN Play (Easiest)

1. Host finds local IP (example `192.168.1.34`).
2. Friends on same network open:

```text
http://192.168.1.34:4000
```

3. Create room and share room code.

## 5) Internet Play (Different Networks)

Choose one method:

## Option A: Port Forwarding (direct)

- Forward router external port `4000` -> host machine `4000`.
- Open firewall for inbound TCP `4000`.
- Friends join via your public IP/domain:

```text
http://<PUBLIC_IP_OR_DOMAIN>:4000
```

## Option B: Tailscale (recommended private access)

- All players install Tailscale and join same tailnet.
- Host shares Tailscale IP (100.x.x.x) or MagicDNS name.
- Friends open:

```text
http://<TAILSCALE_HOST>:4000
```

This avoids exposing your home router publicly.

## Option C: Tunnel service (quick temporary)

Use tools like Cloudflare Tunnel / ngrok / similar to expose `localhost:4000`.

## 6) Host Runtime Tips

- Keep host laptop awake (disable sleep during game).
- Use Ethernet if possible for stability.
- Close heavy background uploads/downloads.

## 7) Common Problems

## Friends cannot open host URL

- Check host machine firewall.
- Confirm server is running on port `4000`.
- Confirm correct IP and network.
- If internet play, re-check router port forward or tunnel status.

## Socket disconnects

- Network instability on host side.
- Host machine sleeping.
- ISP/router resets.

## 8) Security Note

If you use direct port forwarding, anyone with your public URL can try connecting.
For private game nights, prefer Tailscale or a password-protected tunnel whenever possible.

## 9) Optional Future Upgrade

When you want always-on availability, use cloud hosting later (Azure guide remains in `docs/AZURE_SETUP.md`).