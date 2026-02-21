# UAT Checklist

## Environment

- Backend running (`apps/server`).
- Frontend running (`apps/web`).
- Two or more browser clients/devices for multiplayer validation.

## A) Platform Shell

- Open `/` landing page.
- Verify two options appear: Casino and Bank.
- Verify each option routes to its own lobby page.
- Verify AR/EN toggle changes labels and page direction.

## B) Casino Room Flow

- Create Casino room as host.
- Join room from at least 2 additional clients.
- Start game from host client.

## Timed rounds (reversed/flag/trivia)

- Confirm exactly one buzzer winner per window.
- Press buzz on multiple clients nearly simultaneously; confirm deterministic lock.
- Submit wrong answer; confirm score `-1` and excluded player cannot buzz immediately.
- Submit correct answer; confirm score `+1`, round end event, and reveal.
- Let answer timer expire; confirm timeout handling and score deduction.

## Drawing round

- Confirm sequential drawer turns.
- Submit drawings from all players.
- Confirm voting phase and self-vote prevention.
- Confirm vote winner(s) receive score updates.

## Host controls

- Pause/resume changes room state.
- Skip progresses/reveals current round.
- Kick removes player from room state.
- Score adjust updates target player score.

## C) Bank Room Flow

- Create Bank room as host (official and house presets).
- Join room with up to 6 players.
- Start game from host.

## Core gameplay

- Roll dice advances position.
- Passing GO gives salary.
- Landing on unowned property shows buy offer.
- Declining purchase starts auction.
- Bidding and auction close assign ownership.
- Landing on owned tile charges rent.
- Tax and card actions apply cash changes.
- Go-to-jail path sends player to jail.
- Mortgage toggle updates cash and mortgage state.
- House buy/sell applies where valid.
- Trade proposal and accept/reject flow works.
- Bankruptcy event triggers when payment cannot be covered.
- Winner event emitted when one active player remains.

## Turn management

- End turn moves to next player.
- Host toggles timer on/off.
- Turn timeout auto-skips when timer enabled.

## D) Reconnect and Host Transfer

- Disconnect a non-host player and reconnect via same browser session; verify player seat restored.
- Disconnect current host; verify auto-transfer to next connected player.

## E) Deployment Validation

- Frontend served from Azure Static Web Apps.
- Backend served from Azure Container Apps.
- `/health` endpoint returns OK.
- Room creation/join works through public URLs.
- Socket events continue across real internet network.