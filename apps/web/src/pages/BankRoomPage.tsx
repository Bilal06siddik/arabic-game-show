import type { BankRoomState } from '@ags/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { PageLayout } from '../components/PageLayout';
import { useLanguage } from '../components/LanguageProvider';
import { reconnectRoom } from '../lib/api';
import { readSession, saveSession, type RoomSession } from '../lib/session';
import { createRoomSocket } from '../lib/socket';

interface FeedItem {
  at: number;
  label: string;
}

export function BankRoomPage(): JSX.Element {
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const { roomCode = '' } = useParams();

  const [session, setSession] = useState<RoomSession | undefined>(() =>
    readSession('bank', roomCode.toUpperCase()),
  );
  const [state, setState] = useState<BankRoomState>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [bidAmount, setBidAmount] = useState(10);
  const [mortgageTileId, setMortgageTileId] = useState(1);
  const [houseTileId, setHouseTileId] = useState(1);
  const [tradeTo, setTradeTo] = useState('');
  const [tradeCashFrom, setTradeCashFrom] = useState(0);
  const [tradeCashTo, setTradeCashTo] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const reconnectingRef = useRef(false);

  useEffect(() => {
    if (!session) {
      return;
    }

    const socket = createRoomSocket('bank', {
      roomCode: session.roomCode,
      playerId: session.playerId,
      sessionToken: session.sessionToken,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError('');
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('room:state_sync', (payload: { state: BankRoomState }) => {
      setState(payload.state);
    });

    socket.on('room:error', (payload: { message?: string }) => {
      setError(payload.message ?? 'Room error');
    });

    socket.onAny((eventName) => {
      setFeed((prev) => [{ at: Date.now(), label: eventName }, ...prev].slice(0, 20));
    });

    socket.on('connect_error', async (connectError) => {
      const message = connectError?.message ?? '';
      if (!message.includes('INVALID_SESSION') || reconnectingRef.current) {
        setError(message || 'Connection failed');
        return;
      }

      reconnectingRef.current = true;
      try {
        const refreshed = await reconnectRoom(session.roomCode, {
          sessionToken: session.sessionToken,
        });
        const updated: RoomSession = {
          ...session,
          playerId: refreshed.playerId,
          sessionToken: refreshed.sessionToken,
        };
        saveSession(updated);
        setSession(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reconnect failed');
      } finally {
        reconnectingRef.current = false;
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session]);

  const me = useMemo(
    () => state?.players.find((player) => player.id === session?.playerId),
    [state, session?.playerId],
  );
  const isHost = Boolean(me?.isHost);

  const myBankState = useMemo(
    () => state?.bankPlayers.find((player) => player.playerId === me?.id),
    [state, me?.id],
  );

  const ownerMap = useMemo(() => {
    const map = new Map<number, string>();
    state?.bankPlayers.forEach((bankPlayer) => {
      bankPlayer.assets.forEach((asset) => {
        map.set(asset.tileId, bankPlayer.playerId);
      });
    });
    return map;
  }, [state]);

  function emit(event: string, payload?: unknown): void {
    socketRef.current?.emit(event, payload);
  }

  function sendHostAction(action: 'pause' | 'resume' | 'skip' | 'toggle_timer', payload?: unknown): void {
    emit('bank:host_action', { action, payload });
  }

  if (!session) {
    return (
      <PageLayout title={tr('bank.title')} backTo="/bank">
        <section className="panel">
          <p>No local session found for room {roomCode}.</p>
          <button type="button" className="primary-btn" onClick={() => navigate('/bank')}>
            {tr('common.back')}
          </button>
        </section>
      </PageLayout>
    );
  }

  const myTurn = state?.turn?.currentPlayerId === me?.id;
  const pending = state?.pendingAction;

  return (
    <PageLayout title={tr('bank.title')} subtitle={`Room ${session.roomCode}`} backTo="/bank">
      <div className="room-grid">
        <section className="panel">
          <h2>{tr('common.status')}</h2>
          <p>
            {connected ? 'Connected' : tr('common.notConnected')} | {state?.meta.status ?? 'loading'}
          </p>
          <p>Rule: {state?.rulePreset}</p>
          <p>Turn: {state?.turn?.turnNumber ?? '-'}</p>
          <p>Current Player: {state?.turn?.currentPlayerId ?? '-'}</p>
          <p>Pending: {pending?.type ?? '-'}</p>
          {error ? <p className="error-text">{error}</p> : null}

          <div className="player-list">
            {state?.bankPlayers.map((bankPlayer) => {
              const profile = state.players.find((player) => player.id === bankPlayer.playerId);
              return (
                <article key={bankPlayer.playerId} className={`player-card ${bankPlayer.playerId === me?.id ? 'self' : ''}`}>
                  <h4>{profile?.name ?? bankPlayer.playerId}</h4>
                  <p>
                    {tr('bank.cash')}: {bankPlayer.cash}
                  </p>
                  <p>Position: {bankPlayer.position}</p>
                  <p>Assets: {bankPlayer.assets.length}</p>
                  <p>{bankPlayer.bankrupt ? 'Bankrupt' : 'Active'}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>Actions</h2>

          {isHost && state?.meta.status === 'lobby' ? (
            <button type="button" className="primary-btn" onClick={() => emit('bank:start_game')}>
              {tr('bank.startGame')}
            </button>
          ) : null}

          {myTurn && pending?.type === 'roll' ? (
            <button type="button" className="primary-btn" onClick={() => emit('bank:roll_request')}>
              {tr('bank.rollDice')}
            </button>
          ) : null}

          {myTurn && pending?.type === 'buy_or_auction' ? (
            <div className="inline-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => emit('bank:buy_commit', { tileId: pending.tileId, accept: true })}
              >
                {tr('bank.buy')}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => emit('bank:buy_commit', { tileId: pending.tileId, accept: false })}
              >
                {tr('bank.auction')}
              </button>
            </div>
          ) : null}

          {state?.auction ? (
            <div className="auction-box">
              <p>Auction tile: {state.auction.tileId}</p>
              <label>
                Bid
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(event) => setBidAmount(Number(event.target.value))}
                />
              </label>
              <div className="inline-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => emit('bank:auction_bid', { amount: bidAmount })}
                >
                  {tr('bank.auction')}
                </button>
                <button type="button" className="secondary-btn" onClick={() => emit('bank:auction_end')}>
                  {tr('bank.closeAuction')}
                </button>
              </div>
            </div>
          ) : null}

          {myTurn && pending?.type === 'end_turn' ? (
            <button type="button" className="primary-btn" onClick={() => emit('bank:end_turn')}>
              {tr('bank.endTurn')}
            </button>
          ) : null}

          {myBankState ? (
            <div className="tool-grid">
              <label>
                Mortgage Tile ID
                <input
                  type="number"
                  value={mortgageTileId}
                  onChange={(event) => setMortgageTileId(Number(event.target.value))}
                />
              </label>
              <div className="inline-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => emit('bank:mortgage_toggle', { tileId: mortgageTileId, mortgaged: true })}
                >
                  Mortgage
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => emit('bank:mortgage_toggle', { tileId: mortgageTileId, mortgaged: false })}
                >
                  Redeem
                </button>
              </div>

              <label>
                House Tile ID
                <input
                  type="number"
                  value={houseTileId}
                  onChange={(event) => setHouseTileId(Number(event.target.value))}
                />
              </label>
              <div className="inline-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => emit('bank:house_action', { tileId: houseTileId, operation: 'buy' })}
                >
                  Buy House
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => emit('bank:house_action', { tileId: houseTileId, operation: 'sell' })}
                >
                  Sell House
                </button>
              </div>

              <label>
                Trade To (Player ID)
                <input value={tradeTo} onChange={(event) => setTradeTo(event.target.value)} />
              </label>
              <label>
                Cash From Me
                <input
                  type="number"
                  value={tradeCashFrom}
                  onChange={(event) => setTradeCashFrom(Number(event.target.value))}
                />
              </label>
              <label>
                Cash To Me
                <input
                  type="number"
                  value={tradeCashTo}
                  onChange={(event) => setTradeCashTo(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  emit('bank:trade_propose', {
                    toPlayerId: tradeTo,
                    cashFrom: tradeCashFrom,
                    cashTo: tradeCashTo,
                    assetsFrom: [],
                    assetsTo: [],
                  })
                }
              >
                Propose Trade
              </button>
            </div>
          ) : null}

          {state?.openTradeOffers
            .filter((offer) => offer.toPlayerId === me?.id && offer.status === 'pending')
            .map((offer) => (
              <div key={offer.id} className="trade-offer">
                <p>Trade from {offer.fromPlayerId}</p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => emit('bank:trade_decide', { tradeId: offer.id, accept: true })}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => emit('bank:trade_decide', { tradeId: offer.id, accept: false })}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}

          {isHost ? (
            <div className="host-controls">
              <button type="button" className="secondary-btn" onClick={() => sendHostAction('pause')}>
                Pause
              </button>
              <button type="button" className="secondary-btn" onClick={() => sendHostAction('resume')}>
                Resume
              </button>
              <button type="button" className="secondary-btn" onClick={() => sendHostAction('skip')}>
                Skip Turn
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  sendHostAction('toggle_timer', {
                    timerEnabled: !state?.turn?.timerEnabled,
                  })
                }
              >
                {tr('bank.toggleTimer')}:{' '}
                {state?.turn?.timerEnabled ? tr('bank.timerOff') : tr('bank.timerOn')}
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel board-panel">
          <h2>Board</h2>
          <div className="tile-grid">
            {state?.board.tiles.map((tile) => {
              const ownerId = ownerMap.get(tile.id);
              const ownerName = state.players.find((player) => player.id === ownerId)?.name;
              return (
                <article key={tile.id} className="tile-card">
                  <h4>
                    #{tile.id} {tile.name.en}
                  </h4>
                  <p>{tile.kind}</p>
                  <p>{tile.name.ar}</p>
                  <p>Owner: {ownerName ?? '-'}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>Live Events</h2>
          <ul className="event-list">
            {feed.map((item) => (
              <li key={`${item.at}-${item.label}`}>
                <span>{new Date(item.at).toLocaleTimeString()}</span>
                <strong>{item.label}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageLayout>
  );
}