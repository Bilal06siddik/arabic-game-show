import type { BankPlayerState, BankRoomState, BankTile, PieceColor, Player } from '@ags/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../components/LanguageProvider';

interface FeedItem {
  at: number;
  label: string;
}

interface DiceResultEvent {
  nonce: number;
  playerId: string;
  d1: number;
  d2: number;
  total: number;
  stayedInJail?: boolean;
  threeDoubles?: boolean;
}

interface Bank2DExperienceProps {
  roomCode: string;
  state?: BankRoomState;
  sessionPlayerId: string;
  connected: boolean;
  error: string;
  feed: FeedItem[];
  onEmit: (event: string, payload?: unknown) => void;
  lastDiceEvent?: DiceResultEvent;
  shareLink: string;
  showLobbyInvite: boolean;
  onCopyInviteLink: () => void;
  copiedLink: boolean;
}

const DEFAULT_PLAYER_COLORS = ['#ff6f61', '#2fa7ff', '#f6c945', '#63d17d', '#bf8bff', '#ff9f40'];
const BOARD_TILE_COUNT = 40;
const BASE_MOVE_STEP_MS = 160;
const MAX_MOVE_ANIMATION_MS = 2200;

export function Bank2DExperience(props: Bank2DExperienceProps): JSX.Element {
  const { tr, language } = useLanguage();
  const { state } = props;

  const me = useMemo(
    () => state?.players?.find((player) => player.id === props.sessionPlayerId),
    [props.sessionPlayerId, state],
  );
  const isHost = Boolean(me?.isHost);
  const myTurn = state?.turn?.currentPlayerId === me?.id;
  const pending = state?.pendingAction;

  const ownerMap = useMemo(() => {
    const map = new Map<number, string>();
    state?.bankPlayers?.forEach((bankPlayer) => {
      bankPlayer.assets.forEach((asset) => {
        map.set(asset.tileId, bankPlayer.playerId);
      });
    });
    return map;
  }, [state]);

  const [selectedTileId, setSelectedTileId] = useState<number>(0);
  const [feedOpen, setFeedOpen] = useState(false);
  const [bidAmount, setBidAmount] = useState(10);
  const [kickPlayerId, setKickPlayerId] = useState('');
  const [forceEndPlayerId, setForceEndPlayerId] = useState('');
  const [diceVisual, setDiceVisual] = useState<{ d1: number; d2: number; nonce: number }>();
  const [animatingPlayerIds, setAnimatingPlayerIds] = useState<Set<string>>(new Set());
  const [tokenVisualPositions, setTokenVisualPositions] = useState<Record<string, number>>({});
  const tokenVisualPositionsRef = useRef<Record<string, number>>({});
  const movementTimersRef = useRef<Record<string, number>>({});
  const queuedTargetsRef = useRef<Record<string, number | undefined>>({});

  useEffect(() => {
    if (props.lastDiceEvent) {
      setDiceVisual({
        d1: props.lastDiceEvent.d1,
        d2: props.lastDiceEvent.d2,
        nonce: props.lastDiceEvent.nonce,
      });
    }
  }, [props.lastDiceEvent]);

  useEffect(() => {
    tokenVisualPositionsRef.current = tokenVisualPositions;
  }, [tokenVisualPositions]);

  function clearMovementTimer(playerId: string): void {
    const timer = movementTimersRef.current[playerId];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete movementTimersRef.current[playerId];
    }
  }

  function startTokenMovement(playerId: string, targetTile: number): void {
    const normalizedTarget = normalizeTileIndex(targetTile);
    const currentVisual = tokenVisualPositionsRef.current[playerId];

    if (currentVisual === undefined) {
      tokenVisualPositionsRef.current = { ...tokenVisualPositionsRef.current, [playerId]: normalizedTarget };
      setTokenVisualPositions((previous) => ({ ...previous, [playerId]: normalizedTarget }));
      queuedTargetsRef.current[playerId] = undefined;
      return;
    }

    if (currentVisual === normalizedTarget) {
      queuedTargetsRef.current[playerId] = undefined;
      setAnimatingPlayerIds((previous) => {
        if (!previous.has(playerId)) {
          return previous;
        }
        const next = new Set(previous);
        next.delete(playerId);
        return next;
      });
      return;
    }

    if (movementTimersRef.current[playerId] !== undefined) {
      queuedTargetsRef.current[playerId] = normalizedTarget;
      return;
    }

    const path = buildForwardStepPath(currentVisual, normalizedTarget);
    if (path.length === 0) {
      return;
    }

    const stepDuration = resolveMoveStepDuration(path.length);
    let pathIndex = 0;

    setAnimatingPlayerIds((previous) => {
      const next = new Set(previous);
      next.add(playerId);
      return next;
    });

    const runStep = () => {
      const nextTile = path[pathIndex];
      tokenVisualPositionsRef.current = { ...tokenVisualPositionsRef.current, [playerId]: nextTile };
      setTokenVisualPositions((previous) => ({ ...previous, [playerId]: nextTile }));
      pathIndex += 1;

      if (pathIndex >= path.length) {
        clearMovementTimer(playerId);
        setAnimatingPlayerIds((previous) => {
          if (!previous.has(playerId)) {
            return previous;
          }
          const next = new Set(previous);
          next.delete(playerId);
          return next;
        });

        const queuedTarget = queuedTargetsRef.current[playerId];
        queuedTargetsRef.current[playerId] = undefined;
        if (queuedTarget !== undefined && queuedTarget !== nextTile) {
          startTokenMovement(playerId, queuedTarget);
        }
        return;
      }

      movementTimersRef.current[playerId] = window.setTimeout(runStep, stepDuration);
    };

    movementTimersRef.current[playerId] = window.setTimeout(runStep, stepDuration);
  }

  useEffect(() => {
    if (!state) {
      return;
    }

    const livePlayerIds = new Set<string>();
    const seededVisualPositions: Record<string, number> = { ...tokenVisualPositionsRef.current };
    let hasSeededChanges = false;
    const removedIds: string[] = [];

    state.bankPlayers.forEach((bankPlayer) => {
      livePlayerIds.add(bankPlayer.playerId);
      if (seededVisualPositions[bankPlayer.playerId] === undefined) {
        seededVisualPositions[bankPlayer.playerId] = normalizeTileIndex(bankPlayer.position);
        hasSeededChanges = true;
      }
    });

    Object.keys(seededVisualPositions).forEach((playerId) => {
      if (livePlayerIds.has(playerId)) {
        return;
      }
      delete seededVisualPositions[playerId];
      delete queuedTargetsRef.current[playerId];
      clearMovementTimer(playerId);
      removedIds.push(playerId);
      hasSeededChanges = true;
    });

    if (removedIds.length > 0) {
      setAnimatingPlayerIds((previous) => {
        const next = new Set(previous);
        removedIds.forEach((playerId) => next.delete(playerId));
        return next;
      });
    }

    if (hasSeededChanges) {
      tokenVisualPositionsRef.current = seededVisualPositions;
      setTokenVisualPositions(seededVisualPositions);
    }

    state.bankPlayers.forEach((bankPlayer) => {
      const currentVisual = seededVisualPositions[bankPlayer.playerId];
      const target = normalizeTileIndex(bankPlayer.position);

      if (currentVisual === target) {
        queuedTargetsRef.current[bankPlayer.playerId] = undefined;
        return;
      }

      if (movementTimersRef.current[bankPlayer.playerId] !== undefined) {
        queuedTargetsRef.current[bankPlayer.playerId] = target;
        return;
      }

      startTokenMovement(bankPlayer.playerId, target);
    });
  }, [state?.bankPlayers]);

  useEffect(
    () => () => {
      Object.values(movementTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      movementTimersRef.current = {};
      queuedTargetsRef.current = {};
    },
    [],
  );

  useEffect(() => {
    if (!state?.turn?.currentPlayerId) {
      setForceEndPlayerId('');
      return;
    }
    setForceEndPlayerId((previous) => {
      if (previous && state.players.some((player) => player.id === previous)) {
        return previous;
      }
      return state.turn?.currentPlayerId ?? '';
    });
  }, [state?.players, state?.turn?.currentPlayerId]);

  if (!state) {
    return <div className="bank2d-root loading">Loading...</div>;
  }

  const selectedTile = state.board.tiles.find((tile) => tile.id === selectedTileId);
  const selectedTileOwnerId = selectedTile ? ownerMap.get(selectedTile.id) : undefined;
  const selectedOwnerName = state.players.find((player) => player.id === selectedTileOwnerId)?.name;
  const playersInLobby = state.players.filter((player) => player.role === 'player').length;

  const scoreboard = state.bankPlayers
    .map((bankPlayer) => ({
      bankPlayer,
      profile: state.players.find((player) => player.id === bankPlayer.playerId),
    }))
    .sort((a, b) => b.bankPlayer.cash - a.bankPlayer.cash);

  const currentPlayerName =
    state.turn?.currentPlayerId && state.players.find((player) => player.id === state.turn?.currentPlayerId)?.name;
  const tokenPositions: Record<string, number> = {};
  state.bankPlayers.forEach((player) => {
    tokenPositions[player.playerId] = player.position;
  });
  const boardTokenPositions: Record<string, number> = {};
  state.bankPlayers.forEach((player) => {
    boardTokenPositions[player.playerId] = tokenVisualPositions[player.playerId] ?? player.position;
  });

  const hasProminentAction =
    (isHost && state.meta.status === 'lobby') ||
    (myTurn && (pending?.type === 'roll' || pending?.type === 'buy_or_auction' || pending?.type === 'end_turn'));
  const turnActionButtons = (
    <>
      {isHost && state.meta.status === 'lobby' ? (
        <button type="button" className="primary-btn" onClick={() => props.onEmit('bank:start_game')}>
          {tr('bank.startGame')}
        </button>
      ) : null}

      {myTurn && pending?.type === 'roll' ? (
        <button type="button" className="primary-btn" onClick={() => props.onEmit('bank:roll_request')}>
          {tr('bank.rollDice')}
        </button>
      ) : null}

      {myTurn && pending?.type === 'buy_or_auction' ? (
        <div className="inline-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={() => props.onEmit('bank:buy_commit', { tileId: pending.tileId, accept: true })}
          >
            {tr('bank.buy')}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => props.onEmit('bank:buy_commit', { tileId: pending.tileId, accept: false })}
          >
            {tr('bank.auction')}
          </button>
        </div>
      ) : null}

      {myTurn && pending?.type === 'end_turn' ? (
        <button type="button" className="primary-btn" onClick={() => props.onEmit('bank:end_turn')}>
          {tr('bank.endTurn')}
        </button>
      ) : null}
    </>
  );

  return (
    <div className="bank2d-root">
      <section className="bank2d-status-strip">
        <div className="bank2d-pill">
          <strong>{tr('common.roomCode')}:</strong> {props.roomCode}
        </div>
        <div className="bank2d-pill">
          <strong>{tr('common.status')}:</strong>{' '}
          {props.connected ? tr('bank.connected') : tr('common.notConnected')}
        </div>
        <div className="bank2d-pill">
          <strong>{tr('bank.turnNumber')}:</strong> {state.turn?.turnNumber ?? '-'}
        </div>
        <div className="bank2d-pill">
          <strong>{tr('bank.currentPlayer')}:</strong> {currentPlayerName ?? tr('bank.none')}
        </div>
        <div className="bank2d-pill">
          <strong>{tr('bank.pendingAction')}:</strong> {pending?.type ?? tr('bank.none')}
        </div>
        {props.error ? <div className="bank2d-pill danger">{props.error}</div> : null}
      </section>

      <section className="bank2d-grid">
        <aside className="bank2d-side">
          <section className="bank2d-card">
            <h3>{tr('bank.controls')}</h3>
            {props.showLobbyInvite ? (
              <div className="bank2d-inline-box">
                <p>{tr('bank.waitingForPlayers')}</p>
                <p>
                  {tr('bank.playersInLobby')}: {playersInLobby}
                </p>
                <p>
                  {tr('bank.inviteLink')}: <code>{props.shareLink}</code>
                </p>
                <button type="button" className="secondary-btn" onClick={props.onCopyInviteLink}>
                  {props.copiedLink ? tr('bank.linkCopied') : tr('bank.copyLink')}
                </button>
              </div>
            ) : null}

            {turnActionButtons}

            {state.auction ? (
              <div className="bank2d-inline-box">
                <p>
                  {tr('bank.auctionTile')}: #{state.auction.tileId}
                </p>
                <label>
                  {tr('bank.bidAmount')}
                  <input
                    type="number"
                    value={bidAmount}
                    min={1}
                    onChange={(event) => setBidAmount(Number.parseInt(event.target.value, 10) || 0)}
                  />
                </label>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={bidAmount < 1}
                    onClick={() => props.onEmit('bank:auction_bid', { amount: bidAmount })}
                  >
                    {tr('bank.auction')}
                  </button>
                  <button type="button" className="secondary-btn" onClick={() => props.onEmit('bank:auction_end')}>
                    {tr('bank.closeAuction')}
                  </button>
                </div>
              </div>
            ) : null}

          </section>

          <section className="bank2d-card">
            <h3>{tr('bank.tileDetails')}</h3>
            {selectedTile ? (
              <>
                <p>
                  #{selectedTile.id} {selectedTile.name[language]}
                </p>
                <p>
                  <strong>{tr('bank.owner')}:</strong> {selectedOwnerName ?? tr('bank.unowned')}
                </p>
                <p>
                  <strong>{tr('bank.tileKind')}:</strong> {selectedTile.kind}
                </p>
                {selectedTile.kind === 'property' && selectedTile.price ? (
                  <p>
                    <strong>Price:</strong> {selectedTile.price}
                  </p>
                ) : null}
              </>
            ) : (
              <p>{tr('bank.none')}</p>
            )}
          </section>
        </aside>

        <section className="bank2d-board-stage">
          <div className="bank2d-board-stage-head">
            <h2>Bank AlHaz Board</h2>
            <div className="bank2d-board-stage-meta">
              <p>{state.lastEvent ?? tr('bank.none')}</p>
              {diceVisual ? (
                <div key={diceVisual.nonce} className="bank2d-dice-overlay animate-roll" aria-live="polite">
                  <div className="bank2d-die">{diceVisual.d1}</div>
                  <div className="bank2d-die">{diceVisual.d2}</div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="bank2d-board-shell">
            <Bank2DBoard
              tiles={state.board.tiles}
              language={language}
              selectedTileId={selectedTileId}
              onSelectTile={setSelectedTileId}
              tokenPositions={boardTokenPositions}
              players={state.players}
              bankPlayers={state.bankPlayers}
              ownerMap={ownerMap}
              animatingPlayerIds={animatingPlayerIds}
            />

            {hasProminentAction ? (
              <div className="bank2d-center-controls">
                <h4>{tr('bank.controls')}</h4>
                {turnActionButtons}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="bank2d-side">
          <section className="bank2d-card">
            <h3>{tr('bank.players')}</h3>
            <div className="bank2d-player-list">
              {scoreboard.map(({ bankPlayer, profile }) => (
                <article
                  key={bankPlayer.playerId}
                  className={`player-card bank2d-player-card ${bankPlayer.playerId === me?.id ? 'self' : ''} ${state.turn?.currentPlayerId === bankPlayer.playerId ? 'turn' : ''}`}
                >
                  <div className="bank2d-player-card-head">
                    <h4>{profile?.name ?? bankPlayer.playerId}</h4>
                    <span className={`bank2d-player-state ${bankPlayer.bankrupt ? 'bankrupt' : 'active'}`}>
                      {bankPlayer.bankrupt ? tr('bank.bankrupt') : tr('bank.active')}
                    </span>
                  </div>
                  <div className="bank2d-player-metrics">
                    <div className="bank2d-player-metric cash">
                      <span>{tr('bank.cash')}</span>
                      <strong>${formatCompactNumber(bankPlayer.cash)}</strong>
                    </div>
                    <div className="bank2d-player-metric">
                      <span>{tr('bank.assets')}</span>
                      <strong>{bankPlayer.assets.length}</strong>
                    </div>
                    <div className="bank2d-player-metric">
                      <span>{tr('bank.position')}</span>
                      <strong>{tokenPositions[bankPlayer.playerId] ?? bankPlayer.position}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="bank2d-bottom-row">
        <details className="bank2d-card bank2d-events" open={feedOpen} onToggle={(e) => setFeedOpen(e.currentTarget.open)}>
          <summary>{tr('bank.events')}</summary>
          <ul className="event-list">
            {props.feed.map((item) => (
              <li key={`${item.at}-${item.label}`}>
                <span>{new Date(item.at).toLocaleTimeString()}</span>
                <strong>{item.label}</strong>
              </li>
            ))}
          </ul>
        </details>

        {isHost ? (
          <details className="bank2d-card bank2d-host-drawer">
            <summary>{tr('bank.hostTools')}</summary>
            <label>
              {tr('bank.kickPlayer')}
              <select value={kickPlayerId} onChange={(event) => setKickPlayerId(event.target.value)}>
                <option value="">{tr('bank.none')}</option>
                {state.players
                  .filter((player) => player.id !== me?.id)
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="danger-btn"
              disabled={!kickPlayerId}
              onClick={() =>
                props.onEmit('bank:host_action', {
                  action: 'kick',
                  payload: { playerId: kickPlayerId },
                })
              }
            >
              {tr('bank.kickPlayer')}
            </button>
            <label>
              {tr('bank.currentPlayer')}
              <select value={forceEndPlayerId} onChange={(event) => setForceEndPlayerId(event.target.value)}>
                <option value="">{tr('bank.none')}</option>
                {state.bankPlayers
                  .filter((bankPlayer) => !bankPlayer.bankrupt)
                  .map((bankPlayer) => {
                    const profile = state.players.find((player) => player.id === bankPlayer.playerId);
                    return (
                      <option key={bankPlayer.playerId} value={bankPlayer.playerId}>
                        {profile?.name ?? bankPlayer.playerId}
                      </option>
                    );
                  })}
              </select>
            </label>
            <button
              type="button"
              className="secondary-btn"
              disabled={!forceEndPlayerId}
              onClick={() =>
                props.onEmit('bank:host_action', {
                  action: 'skip',
                  payload: { playerId: forceEndPlayerId },
                })
              }
            >
              {tr('bank.skipTurn')}
            </button>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function Bank2DBoard(props: {
  tiles: BankTile[];
  language: 'ar' | 'en';
  selectedTileId: number;
  onSelectTile: (id: number) => void;
  tokenPositions: Record<string, number>;
  players: Player[];
  bankPlayers: BankPlayerState[];
  ownerMap: Map<number, string>;
  animatingPlayerIds: Set<string>;
}) {
  return (
    <div className="bank2d-board">
      {props.tiles.map((tile) => {
        const isSelected = props.selectedTileId === tile.id;

        let row = 1;
        let col = 1;
        let side = '';

        if (tile.id >= 0 && tile.id <= 10) {
          row = 11;
          col = 11 - tile.id;
          side = 'bottom';
        } else if (tile.id > 10 && tile.id <= 20) {
          col = 1;
          row = 11 - (tile.id - 10);
          side = 'left';
        } else if (tile.id > 20 && tile.id <= 30) {
          row = 1;
          col = 1 + (tile.id - 20);
          side = 'top';
        } else if (tile.id > 30 && tile.id < 40) {
          col = 11;
          row = 1 + (tile.id - 30);
          side = 'right';
        }

        const isCorner = tile.id % 10 === 0;
        const playersOnTile = props.bankPlayers.filter((bankPlayer) => props.tokenPositions[bankPlayer.playerId] === tile.id);
        const ownerId = props.ownerMap.get(tile.id);
        const ownerColor = ownerId ? props.players.find((player) => player.id === ownerId)?.pieceColor : undefined;
        const tileColorClass = tile.kind === 'property' ? `color-${normalizeColorKey(tile.color)}` : '';
        const tilePrice = getTilePrice(tile);

        return (
          <div
            key={tile.id}
            className={`bank2d-tile tile-${side} ${isCorner ? 'tile-corner' : ''} ${isSelected ? 'selected' : ''}`}
            style={{ gridColumn: col, gridRow: row }}
            onClick={() => props.onSelectTile(tile.id)}
          >
            {tile.kind === 'property' && tile.color ? <div className={`tile-color-bar ${tileColorClass}`} /> : null}
            <div className="tile-content">
              <span className="tile-name">{tile.name[props.language]}</span>
              <span className="tile-kind">{tile.kind.replaceAll('_', ' ')}</span>
              {tilePrice !== undefined ? <span className="tile-price">${tilePrice}</span> : null}
            </div>

            {ownerColor ? <div className="tile-owner-marker" style={{ backgroundColor: getHexForColor(ownerColor) }} /> : null}

            {playersOnTile.length > 0 ? (
              <div className="tile-tokens">
                {playersOnTile.map((bankPlayer) => {
                  const profile = props.players.find((player) => player.id === bankPlayer.playerId);
                  const playerIndex = profile ? props.players.indexOf(profile) : 0;
                  const bg = profile?.pieceColor
                    ? getHexForColor(profile.pieceColor)
                    : DEFAULT_PLAYER_COLORS[playerIndex % DEFAULT_PLAYER_COLORS.length];

                  return (
                    <div
                      key={bankPlayer.playerId}
                      className={`token-dot${props.animatingPlayerIds.has(bankPlayer.playerId) ? ' moving' : ''}`}
                      style={{ backgroundColor: bg }}
                      title={profile?.name}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="bank2d-board-center">
        <div className="bank2d-logo">Bank AlHaz</div>
        <p className="bank2d-center-tagline">Classic board. Live multiplayer.</p>
      </div>
    </div>
  );
}

function getHexForColor(colorName: PieceColor): string {
  switch (colorName) {
    case 'red':
      return '#ef4444';
    case 'blue':
      return '#3b82f6';
    case 'green':
      return '#22c55e';
    case 'yellow':
      return '#eab308';
    case 'purple':
      return '#a855f7';
    case 'orange':
      return '#f97316';
    case 'pink':
      return '#ec4899';
    case 'teal':
      return '#14b8a6';
    default:
      return '#ffffff';
  }
}

function normalizeColorKey(color: string): string {
  return color.replace(/[^a-zA-Z]/g, '').toLowerCase();
}

function getTilePrice(tile: BankTile): number | undefined {
  if ('price' in tile) {
    return tile.price;
  }
  if (tile.kind === 'tax') {
    return tile.amount;
  }
  return undefined;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function normalizeTileIndex(tile: number): number {
  return ((tile % BOARD_TILE_COUNT) + BOARD_TILE_COUNT) % BOARD_TILE_COUNT;
}

function buildForwardStepPath(from: number, to: number): number[] {
  const start = normalizeTileIndex(from);
  const end = normalizeTileIndex(to);
  const path: number[] = [];
  let cursor = start;

  while (cursor !== end) {
    cursor = (cursor + 1) % BOARD_TILE_COUNT;
    path.push(cursor);
  }

  return path;
}

function resolveMoveStepDuration(stepCount: number): number {
  if (stepCount <= 0) {
    return BASE_MOVE_STEP_MS;
  }
  const uncapped = stepCount * BASE_MOVE_STEP_MS;
  if (uncapped <= MAX_MOVE_ANIMATION_MS) {
    return BASE_MOVE_STEP_MS;
  }
  return Math.max(70, Math.floor(MAX_MOVE_ANIMATION_MS / stepCount));
}
