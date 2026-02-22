import { PIECE_COLORS, type BankRoomState, type PieceColor } from '@ags/shared';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { BankPieceColorPicker } from '../components/BankPieceColorPicker';
import { BankShellLayout } from '../components/BankShellLayout';
import { useLanguage } from '../components/LanguageProvider';
import { Bank2DExperience } from '../features/bank2d/Bank2DExperience';
import { getBankUsedColors, joinRoom, reconnectRoom } from '../lib/api';
import { readSession, saveSession, type RoomSession } from '../lib/session';
import { createRoomSocket } from '../lib/socket';

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



export function BankRoomPage(): JSX.Element {
  const { language, tr } = useLanguage();
  const { roomCode = '' } = useParams();
  const normalizedRoomCode = roomCode.toUpperCase();

  const [session, setSession] = useState<RoomSession | undefined>(() =>
    readSession('bank', normalizedRoomCode),
  );
  const [state, setState] = useState<BankRoomState>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [lastDiceEvent, setLastDiceEvent] = useState<DiceResultEvent>();

  const [bidAmount, setBidAmount] = useState(10);
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingColor, setOnboardingColor] = useState<PieceColor>('blue');
  const [onboardingUnavailableColors, setOnboardingUnavailableColors] = useState<PieceColor[]>([]);
  const [joiningFromLink, setJoiningFromLink] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [kickPlayerId, setKickPlayerId] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const reconnectingRef = useRef(false);
  const diceEventNonceRef = useRef(0);



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

    socket.on(
      'bank:dice_result',
      (payload: {
        playerId: string;
        d1: number;
        d2: number;
        total: number;
        stayedInJail?: boolean;
        threeDoubles?: boolean;
      }) => {
        diceEventNonceRef.current += 1;
        setLastDiceEvent({
          nonce: diceEventNonceRef.current,
          ...payload,
        });
      },
    );

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

  useEffect(() => {
    if (session || normalizedRoomCode.length < 4) {
      return;
    }
    let cancelled = false;
    getBankUsedColors(normalizedRoomCode)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setOnboardingUnavailableColors(response.usedColors);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setOnboardingUnavailableColors([]);
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedRoomCode, session]);

  useEffect(() => {
    if (!onboardingUnavailableColors.includes(onboardingColor)) {
      return;
    }
    const fallback = PIECE_COLORS.find((color) => !onboardingUnavailableColors.includes(color));
    if (fallback) {
      setOnboardingColor(fallback);
    }
  }, [onboardingColor, onboardingUnavailableColors]);

  const me = useMemo(
    () => state?.players?.find((player) => player.id === session?.playerId),
    [state, session?.playerId],
  );
  const isHost = Boolean(me?.isHost);

  const ownerMap = useMemo(() => {
    const map = new Map<number, string>();
    state?.bankPlayers?.forEach((bankPlayer) => {
      bankPlayer.assets.forEach((asset) => {
        map.set(asset.tileId, bankPlayer.playerId);
      });
    });
    return map;
  }, [state]);

  const shareLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/bank/${session?.roomCode ?? normalizedRoomCode}`
      : `/bank/${session?.roomCode ?? normalizedRoomCode}`;

  async function copyInviteLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy link');
    }
  }

  async function joinViaOnboarding(): Promise<void> {
    if (
      !onboardingName.trim() ||
      normalizedRoomCode.length < 4 ||
      onboardingUnavailableColors.includes(onboardingColor)
    ) {
      return;
    }

    try {
      setJoiningFromLink(true);
      setError('');
      const response = await joinRoom(normalizedRoomCode, {
        name: onboardingName.trim(),
        language,
        pieceColor: onboardingColor,
      });

      if (response.gameType !== 'bank') {
        throw new Error('This room is not a bank room.');
      }

      const joinedSession: RoomSession = {
        roomCode: response.roomCode,
        gameType: 'bank',
        playerId: response.playerId,
        sessionToken: response.sessionToken,
        name: onboardingName.trim(),
        language,
        pieceColor: onboardingColor,
      };
      saveSession(joinedSession);
      setSession(joinedSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setJoiningFromLink(false);
    }
  }

  function emit(event: string, payload?: unknown): void {
    socketRef.current?.emit(event, payload);
  }

  if (!session) {
    return (
      <BankShellLayout subtitle={`${tr('common.roomCode')}: ${normalizedRoomCode}`} fullBleed>
        <div className="bank-onboarding-screen">
          <section className="bank-onboarding-card">
            <h2>{tr('bank.onboardingTitle')}</h2>
            <p>{tr('bank.onboardingHint')}</p>
            <div className="bank-room-code-badge">{normalizedRoomCode}</div>
            <label className="bank-field">
              <span className="bank-label">{tr('common.name')}</span>
              <input
                value={onboardingName}
                onChange={(event) => setOnboardingName(event.target.value)}
                maxLength={24}
              />
            </label>
            <BankPieceColorPicker
              value={onboardingColor}
              onChange={setOnboardingColor}
              unavailableColors={onboardingUnavailableColors}
            />
            <button
              type="button"
              className="primary-btn"
              disabled={
                joiningFromLink ||
                !onboardingName.trim() ||
                onboardingUnavailableColors.includes(onboardingColor)
              }
              onClick={joinViaOnboarding}
            >
              {tr('bank.enterToJoin')}
            </button>
            {error ? <p className="error-text">{error}</p> : null}
          </section>
        </div>
      </BankShellLayout>
    );
  }

  const showLobbyInvite = Boolean(isHost && state?.meta?.status === 'lobby');

  return (
    <BankShellLayout subtitle={`${tr('common.roomCode')}: ${session.roomCode}`} fullBleed>
      <Bank2DExperience
        roomCode={session.roomCode}
        state={state}
        sessionPlayerId={session.playerId}
        connected={connected}
        error={error}
        feed={feed}
        onEmit={emit}
        lastDiceEvent={lastDiceEvent}
        shareLink={shareLink}
        showLobbyInvite={showLobbyInvite}
        onCopyInviteLink={copyInviteLink}
        copiedLink={copiedLink}
      />
    </BankShellLayout>
  );
}
