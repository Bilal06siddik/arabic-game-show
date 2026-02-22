import type { CasinoRoomState, DrawingPrompt } from '@ags/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { DrawingPad } from '../components/DrawingPad';
import { DrawingVoteGallery } from '../components/DrawingVoteGallery';
import { ReversedWordsRound } from '../components/ReversedWordsRound';
import { useLanguage } from '../components/LanguageProvider';
import { reconnectRoom } from '../lib/api';
import { readSession, saveSession, type RoomSession } from '../lib/session';
import { createRoomSocket } from '../lib/socket';
import '../styles/casino-arcade.css';

interface FeedItem {
  at: number;
  label: string;
}

export function CasinoRoomPage(): JSX.Element {
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const { roomCode = '' } = useParams();

  const [session, setSession] = useState<RoomSession | undefined>(() =>
    readSession('casino', roomCode.toUpperCase()),
  );
  const [state, setState] = useState<CasinoRoomState>();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const reconnectingRef = useRef(false);

  // Buzzer 7-second countdown
  const [buzzerCountdown, setBuzzerCountdown] = useState<number | null>(null);
  const buzzerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reversed words vote-repeat state (now also tracked from server broadcast)
  const [hasVotedRepeat, setHasVotedRepeat] = useState(false);
  const [repeatVoteCount, setRepeatVoteCount] = useState(0);

  // Give Up vote state (reveal the answer)
  const [hasGivenUp, setHasGivenUp] = useState(false);
  const [giveUpCount, setGiveUpCount] = useState(0);

  // Drawing timer (local countdown from 30)
  const [drawingTimeLeft, setDrawingTimeLeft] = useState(30);
  const drawingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Submit guard — prevents double-sending the same answer
  const hasSubmittedRef = useRef(false);

  // Auto-advance countdown after correct answer
  const [nextRoundCountdown, setNextRoundCountdown] = useState<number | null>(null);
  const nextRoundTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ready-Up state
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!session) return;

    const socket = createRoomSocket('casino', {
      roomCode: session.roomCode,
      playerId: session.playerId,
      sessionToken: session.sessionToken,
    });
    socketRef.current = socket;

    socket.on('connect', () => { setConnected(true); setError(''); });
    socket.on('disconnect', () => setConnected(false));

    socket.on('casino:vote_repeat', (payload: { repeatVoteCount: number; triggered: boolean }) => {
      setRepeatVoteCount(payload.repeatVoteCount);
    });

    socket.on('casino:give_up_vote', (payload: { giveUpCount: number; triggered: boolean }) => {
      setGiveUpCount(payload.giveUpCount);
    });

    socket.on('room:state_sync', (payload: { state: CasinoRoomState }) => {
      setState(payload.state);
    });

    socket.on('room:error', (payload: { message?: string }) => {
      setError(payload.message ?? 'Room error');
    });

    socket.onAny((eventName: string) => {
      setFeed((prev) => [{ at: Date.now(), label: eventName }, ...prev].slice(0, 20));
    });

    socket.on('connect_error', async (connectError: Error & { message: string }) => {
      const message = connectError?.message ?? '';
      if (!message.includes('INVALID_SESSION') || reconnectingRef.current) {
        setError(message || 'Connection failed');
        return;
      }
      reconnectingRef.current = true;
      try {
        const refreshed = await reconnectRoom(session.roomCode, { sessionToken: session.sessionToken });
        const updated: RoomSession = { ...session, playerId: refreshed.playerId, sessionToken: refreshed.sessionToken };
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

  // Buzzer countdown timer
  useEffect(() => {
    if (buzzerCountdown === null) {
      if (buzzerTimerRef.current) clearInterval(buzzerTimerRef.current);
      return;
    }
    if (buzzerTimerRef.current) clearInterval(buzzerTimerRef.current);
    buzzerTimerRef.current = setInterval(() => {
      setBuzzerCountdown((prev) => {
        if (prev === null || prev <= 0) {
          if (buzzerTimerRef.current) clearInterval(buzzerTimerRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (buzzerTimerRef.current) clearInterval(buzzerTimerRef.current); };
  }, [buzzerCountdown]);

  // Drawing phase local timer — auto-submits when it reaches 0
  // IMPORTANT: depend only on the fields that actually change the timer,
  // NOT on state.currentRound (object), which gets a new ref on every socket sync
  const drawingPhase = state?.currentRound?.type === 'drawing' ? state.currentRound.drawing?.phase : undefined;
  const drawingDeadlineAt = state?.currentRound?.type === 'drawing' ? state.currentRound.drawing?.drawingDeadlineAt : undefined;

  useEffect(() => {
    if (drawingPhase === 'drawing' && drawingDeadlineAt) {
      // Compute initial time from server deadline (never drifts)
      const remaining = Math.max(0, Math.round((drawingDeadlineAt - Date.now()) / 1000));
      setDrawingTimeLeft(remaining);
      if (drawingTimerRef.current) clearInterval(drawingTimerRef.current);
      drawingTimerRef.current = setInterval(() => {
        const timeLeft = Math.max(0, Math.round((drawingDeadlineAt - Date.now()) / 1000));
        setDrawingTimeLeft(timeLeft);
        if (timeLeft === 0) {
          // Auto-submit when time runs out (if not already submitted)
          if (!hasSubmittedRef.current) {
            hasSubmittedRef.current = true;
            const canvas = document.querySelector<HTMLCanvasElement>('.skribbl-canvas');
            if (canvas) {
              socketRef.current?.emit('casino:drawing_submit', { imageDataUrl: canvas.toDataURL('image/png') });
            }
          }
          if (drawingTimerRef.current) clearInterval(drawingTimerRef.current);
        }
      }, 500); // tick every 500ms for smoother countdown
    } else {
      if (drawingTimerRef.current) clearInterval(drawingTimerRef.current);
    }
    return () => { if (drawingTimerRef.current) clearInterval(drawingTimerRef.current); };
  }, [drawingPhase, drawingDeadlineAt]);

  // Reset vote/submit flags when round changes
  useEffect(() => {
    setHasVotedRepeat(false);
    setRepeatVoteCount(0);
    setHasGivenUp(false);
    setGiveUpCount(0);
    setAnswer('');
    setBuzzerCountdown(null);
    hasSubmittedRef.current = false;
    setIsReady(false);
    // Clear auto-advance
    if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
    setNextRoundCountdown(null);
  }, [state?.currentRound?.roundNumber]);

  // Auto-advance: when answer is revealed, count down 5s then go to next round
  useEffect(() => {
    const revealed = timedRoundRef.current?.answerRevealed;
    if (revealed) {
      if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
      setNextRoundCountdown(5);
      nextRoundTimerRef.current = setInterval(() => {
        setNextRoundCountdown((prev) => {
          if (prev === null || prev <= 1) {
            if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
            // Host auto-advances
            socketRef.current?.emit('casino:host_action', { action: 'skip' });
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
      setNextRoundCountdown(null);
    }
    return () => { if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentRound?.answerRevealed]);

  const me = useMemo(
    () => state?.players.find((p) => p.id === session?.playerId),
    [state, session?.playerId],
  );

  const round = state?.currentRound;
  const drawingState = round?.type === 'drawing' ? round.drawing : undefined;
  const isHost = Boolean(me?.isHost);
  const timedRound = round && round.type !== 'drawing' ? round : undefined;
  // Keep a ref for the answerRevealed effect (avoids stale closure)
  const timedRoundRef = useRef(timedRound);
  useEffect(() => { timedRoundRef.current = timedRound; }, [timedRound]);

  // Players can buzz again after a wrong answer (excluded list resets per window)
  // Allow buzzing even if excluded — server will decide if it is valid
  const buzzerEligible =
    timedRound &&
    me?.role === 'player' &&
    timedRound.buzzerWindowId &&
    !timedRound.buzzedPlayerId &&
    !timedRound.answerRevealed;

  const isMyAnswerTurn = timedRound && timedRound.buzzedPlayerId === me?.id;
  const currentDrawer = drawingState ? drawingState.drawerOrder[drawingState.currentDrawerIndex] : undefined;
  const currentVoter = drawingState ? drawingState.votingPlayerOrder[drawingState.currentVoterIndex] : undefined;
  const drawingWord = round?.question.type === 'drawing' ? (round.question as DrawingPrompt).word : '';
  const reversedWord = round?.type === 'reversed' ? (round.question as { reversed: string }).reversed ?? '' : '';

  // Player name map for vote gallery
  const playerNames = useMemo(() => {
    const map: Record<string, string> = {};
    state?.players.forEach((p) => { map[p.id] = p.name; });
    return map;
  }, [state?.players]);

  function emit(event: string, payload?: unknown): void {
    socketRef.current?.emit(event, payload);
  }

  function sendHostAction(action: 'pause' | 'resume' | 'skip' | 'kick' | 'score_adjust', payload?: unknown): void {
    emit('casino:host_action', { action, payload });
  }

  function pressBuzzer(): void {
    if (!buzzerEligible) return;
    emit('casino:buzz_press', { windowId: timedRound?.buzzerWindowId });
    setBuzzerCountdown(7);
  }

  /** Submit answer — guarded against double-send */
  function submitAnswer(): void {
    if (hasSubmittedRef.current || !answer.trim()) return;
    hasSubmittedRef.current = true;
    emit('casino:answer_submit', { answer });
    setAnswer('');
    setBuzzerCountdown(null);
  }

  function voteRepeat(): void {
    setHasVotedRepeat(true);
    emit('casino:vote_repeat');
  }

  function readyUp(): void {
    setIsReady(true);
    emit('casino:drawing_ready');
  }

  if (!session) {
    return (
      <div className="arcade-root">
        <div className="arcade-lobby-layout">
          <div className="arcade-panel" style={{ textAlign: 'center' }}>
            <p className="arcade-subtitle" style={{ marginBottom: 20 }}>NO SESSION FOUND FOR ROOM {roomCode}</p>
            <button type="button" className="arcade-btn" onClick={() => navigate('/casino')}>
              ◀ BACK TO LOBBY
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Derive answer-timer bar width
  const answerTimerPct = buzzerCountdown !== null ? (buzzerCountdown / 7) * 100 : 0;

  // Scoreboard: sort by score desc
  const players = [...(state?.players.filter((p) => p.role === 'player') ?? [])].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0),
  );
  const topScore = players[0]?.score ?? 0;

  return (
    <div className="arcade-root" style={{ padding: 16 }}>
      <div className="arcade-room-layout">

        {/* ── LEFT: Scoreboard ── */}
        <aside>
          <div className="arcade-panel" style={{ marginBottom: 14 }}>
            <h2 className="arcade-panel-title">🏆 SCOREBOARD</h2>

            {/* Status bar */}
            <div className="arcade-status-bar">
              <span>
                <span className={`connection-dot ${connected ? 'on' : 'off'}`} />
                {connected ? 'LIVE' : 'DISCONNECTED'}
              </span>
              <span className={`arcade-status-tag ${state?.meta.status ?? ''}`}>
                {(state?.meta.status ?? 'loading').toUpperCase()}
              </span>
              <span style={{ marginLeft: 'auto', opacity: 0.5 }}>{session.roomCode}</span>
            </div>

            {error && <p className="arcade-error" style={{ marginBottom: 10 }}>{error}</p>}

            <div className="arcade-score-grid">
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`arcade-score-card${player.id === me?.id ? ' self' : ''}${(player.score ?? 0) === topScore && topScore > 0 ? ' leader' : ''}`}
                >
                  {(player.score ?? 0) === topScore && topScore > 0 && (
                    <span className="crown">👑</span>
                  )}
                  <span className="player-name">{player.name}</span>
                  <span className="player-score">{player.score ?? 0}</span>
                </div>
              ))}
              {players.length === 0 && (
                <p style={{ fontSize: '0.55rem', color: 'var(--arc-text-soft)', gridColumn: '1/-1', fontFamily: 'var(--arc-pixel-font)' }}>
                  Waiting for players...
                </p>
              )}
            </div>
          </div>

          {/* Live Events — compact */}
          <div className="arcade-panel">
            <h2 className="arcade-panel-title" style={{ fontSize: '0.5rem' }}>LIVE EVENTS</h2>
            <ul className="arcade-event-list">
              {feed.map((item) => (
                <li key={`${item.at}-${item.label}`} className="arcade-event-item">
                  {new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} {item.label}
                </li>
              ))}
              {feed.length === 0 && (
                <li className="arcade-event-item" style={{ opacity: 0.3 }}>Waiting for events...</li>
              )}
            </ul>
          </div>
        </aside>

        {/* ── CENTER: Game Stage ── */}
        <main className="arcade-room-center">

          {/* No round yet */}
          {!round && (
            <div className="arcade-panel">
              <div className="waiting-screen">
                <div className="waiting-icon">🎰</div>
                <p className="waiting-text">WAITING FOR HOST TO START</p>
                {isHost && (
                  <button
                    type="button"
                    className="arcade-btn arcade-btn-green"
                    onClick={() => emit('casino:start_game')}
                    style={{ marginTop: 16 }}
                  >
                    ▶ START GAME
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Reversed Words ── */}
          {round?.type === 'reversed' && (
            <div className="arcade-panel">
              <div className="mini-game-stage">
                <span className="round-type-badge reversed">🔤 الكلمات المعكوسة</span>
                <ReversedWordsRound
                  reversedWord={reversedWord}
                  isFlashing={!timedRound?.buzzedPlayerId && !timedRound?.answerRevealed}
                  canVoteRepeat={me?.role === 'player' && !timedRound?.buzzedPlayerId && !timedRound?.answerRevealed}
                  hasVotedRepeat={hasVotedRepeat}
                  onVoteRepeat={voteRepeat}
                  repeatVoteCount={repeatVoteCount}
                  totalPlayers={players.length}
                  playerAnswered={!!timedRound?.buzzedPlayerId || !!timedRound?.answerRevealed}
                />
              </div>
            </div>
          )}

          {/* ── Flag ── */}
          {round?.type === 'flag' && (
            <div className="arcade-panel">
              <div className="mini-game-stage">
                <span className="round-type-badge flag">🏳️ الصور والأعلام</span>
                <img
                  className="flag-display"
                  src={`https://flagcdn.com/w320/${(round.question as { countryCode: string }).countryCode}.png`}
                  alt="flag"
                />
              </div>
            </div>
          )}

          {/* ── Trivia ── */}
          {round?.type === 'trivia' && (
            <div className="arcade-panel">
              <div className="mini-game-stage">
                <span className="round-type-badge trivia">❓ TRIVIA</span>
                <div className="trivia-question-box" dir="auto">
                  {(round.question as { question: string }).question}
                </div>
              </div>
            </div>
          )}

          {/* ── Drawing ── */}
          {round?.type === 'drawing' && drawingState && (
            <div className="arcade-panel">
              <div style={{ marginBottom: 12 }}>
                <span className="round-type-badge drawing">🎨 DRAWING SHOWDOWN</span>
              </div>

              {drawingState.phase === 'ready_up' && (
                <div className="ready-up-phase" style={{ textAlign: 'center', padding: '40px 0' }}>
                  <p style={{ fontFamily: 'var(--arc-pixel-font)', fontSize: '0.65rem', color: 'var(--arc-neon-cyan)', marginBottom: 20 }}>
                    GET READY! ALL PLAYERS MUST READY UP
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <button
                      type="button"
                      className={`arcade-btn${isReady ? '' : ' arcade-btn-green'}`}
                      disabled={isReady || me?.role !== 'player'}
                      onClick={readyUp}
                      style={{ fontSize: '1rem', padding: '16px 40px' }}
                    >
                      {isReady ? '✓ READY' : 'READY UP!'}
                    </button>
                    <p style={{ fontSize: '0.5rem', opacity: 0.6 }}>
                      {drawingState.readyPlayerIds.length} / {players.length} PLAYERS READY
                    </p>
                  </div>
                </div>
              )}

              {drawingState.phase === 'drawing' && (
                <>
                  {/* Big word headline */}
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <p style={{ fontFamily: 'var(--arc-pixel-font)', fontSize: '0.55rem', color: 'var(--arc-text-soft)', letterSpacing: 2, marginBottom: 8 }}>
                      DRAW THIS WORD:
                    </p>
                    <p style={{
                      fontFamily: 'var(--arc-arabic-font)',
                      fontSize: 'clamp(3rem, 10vw, 6rem)',
                      fontWeight: 900,
                      color: 'var(--arc-neon-yellow)',
                      textShadow: '0 0 20px #ffd700, 0 0 40px #ffd70088',
                      letterSpacing: 4,
                      margin: 0,
                    }}>
                      {drawingWord ?? '⋯⋯⋯⋯'}
                    </p>
                    <p className="insert-coin" style={{ fontSize: '0.5rem', marginTop: 8 }}>
                      ⏱ {drawingTimeLeft}s LEFT — ALL PLAYERS DRAW!
                    </p>
                  </div>

                  {/* ALL players get a drawing pad */}
                  <DrawingPad
                    onSubmit={(imageDataUrl) => emit('casino:drawing_submit', { imageDataUrl })}
                    timeLeft={drawingTimeLeft}
                    showTimer
                    disabled={drawingTimeLeft <= 0}
                  />
                </>
              )}

              {drawingState.phase === 'voting' && (
                <>
                  <p style={{ fontFamily: 'var(--arc-pixel-font)', fontSize: '0.55rem', color: 'var(--arc-text-soft)', marginBottom: 12 }}>
                    {me?.id === currentVoter
                      ? <span style={{ color: 'var(--arc-neon-yellow)', textShadow: 'var(--arc-glow-yellow)' }}>YOUR TURN TO VOTE!</span>
                      : `WAITING FOR ${playerNames[currentVoter ?? ''] ?? 'VOTER'} TO VOTE...`}
                  </p>
                  <DrawingVoteGallery
                    submissions={drawingState.submissions}
                    playerNames={playerNames}
                    myPlayerId={me?.id}
                    currentVoterId={currentVoter}
                    revealNames={false}
                    onVote={(targetPlayerId) => emit('casino:vote_cast', { targetPlayerId })}
                  />
                </>
              )}
            </div>
          )}

          {/* Answer revealed banner + auto-advance countdown */}
          {timedRound?.answerRevealed && (
            <div className="answer-reveal-banner base" style={{ position: 'relative' }}>
              ✅ ANSWER: {timedRound.revealedAnswer ?? (timedRound.question as { answer?: string }).answer ?? '—'}
              {nextRoundCountdown !== null && (
                <span style={{
                  display: 'block',
                  marginTop: 10,
                  fontFamily: 'var(--arc-pixel-font)',
                  fontSize: '0.6rem',
                  color: 'var(--arc-neon-cyan)',
                  textShadow: 'var(--arc-glow-cyan)',
                  letterSpacing: 2,
                  animation: 'blink 1s step-end infinite',
                }}>
                  ⏭ NEXT QUESTION IN {nextRoundCountdown}s...
                </span>
              )}
            </div>
          )}

          {/* ── BUZZER ZONE ── */}
          {round && round.type !== 'drawing' && (
            <div className="arcade-panel">
              <div className="buzzer-zone">
                {isMyAnswerTurn ? (
                  // Answer input mode
                  <div className="answer-zone">
                    <p style={{ fontFamily: 'var(--arc-pixel-font)', fontSize: '0.65rem', color: 'var(--arc-neon-red)', textShadow: 'var(--arc-glow-red)', letterSpacing: 2, marginBottom: 4 }}>
                      ⚡ YOU'RE IN! ANSWER NOW!
                    </p>
                    {buzzerCountdown !== null && (
                      <>
                        <p style={{ fontFamily: 'var(--arc-pixel-font)', fontSize: '1.2rem', color: buzzerCountdown <= 2 ? 'var(--arc-neon-red)' : 'var(--arc-neon-yellow)', textShadow: 'var(--arc-glow-yellow)' }}>
                          {buzzerCountdown}s
                        </p>
                        <div className="answer-timer-bar-wrap" style={{ width: '100%' }}>
                          <div className="answer-timer-bar" style={{ width: `${answerTimerPct}%` }} />
                        </div>
                      </>
                    )}
                    <div className="answer-row">
                      <input
                        className="arcade-input"
                        value={answer}
                        onChange={(e) => { setAnswer(e.target.value); hasSubmittedRef.current = false; }}
                        placeholder="Type your answer..."
                        dir="auto"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitAnswer();
                        }}
                      />
                      <button
                        type="button"
                        className="arcade-btn arcade-btn-green"
                        disabled={!answer.trim() || hasSubmittedRef.current}
                        onClick={submitAnswer}
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                ) : timedRound?.buzzedPlayerId ? (
                  // Someone else buzzed
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontFamily: 'var(--arc-pixel-font)', fontSize: '0.65rem', color: 'var(--arc-neon-yellow)', textShadow: 'var(--arc-glow-yellow)', marginBottom: 8 }}>
                      ⚡ {playerNames[timedRound.buzzedPlayerId] ?? 'PLAYER'} BUZZED IN!
                    </p>
                    <button
                      type="button"
                      className="buzzer-btn"
                      disabled
                    >
                      BUZZ!
                    </button>
                    <p className="buzzer-label locked">LOCKED OUT</p>
                  </div>
                ) : (
                  // Eligible or not for buzzer
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      className="buzzer-btn"
                      disabled={!buzzerEligible}
                      onClick={buzzerEligible ? pressBuzzer : undefined}
                    >
                      BUZZ!
                    </button>
                    <p className={`buzzer-label${buzzerEligible ? '' : ' locked'}`}>
                      {buzzerEligible
                        ? 'PRESS TO BUZZ IN!'
                        : me?.role !== 'player'
                          ? 'HOST / SPECTATOR'
                          : 'WAITING...'}
                    </p>
                    {/* Give Up button — vote to reveal the answer */}
                    {me?.role === 'player' && !timedRound?.answerRevealed && (
                      <button
                        type="button"
                        style={{
                          marginTop: 4,
                          fontFamily: 'var(--arc-pixel-font)',
                          fontSize: '0.5rem',
                          letterSpacing: 2,
                          padding: '6px 16px',
                          background: hasGivenUp ? 'rgba(100,0,0,0.4)' : 'rgba(50,0,0,0.6)',
                          border: `1px solid ${hasGivenUp ? '#666' : 'var(--arc-neon-red)'}`,
                          color: hasGivenUp ? '#666' : 'var(--arc-neon-red)',
                          borderRadius: 4,
                          cursor: hasGivenUp ? 'default' : 'pointer',
                          opacity: hasGivenUp ? 0.6 : 1,
                        }}
                        disabled={hasGivenUp}
                        onClick={() => {
                          if (!hasGivenUp) {
                            setHasGivenUp(true);
                            socketRef.current?.emit('casino:give_up');
                          }
                        }}
                      >
                        🏳 GIVE UP {giveUpCount > 0 ? `(${giveUpCount})` : ''}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </main>

        {/* ── RIGHT: Host Controls ── */}
        {isHost && (
          <aside>
            <div className="arcade-panel">
              <h2 className="arcade-panel-title" style={{ fontSize: '0.55rem' }}>HOST CONTROLS</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {state?.meta.status === 'lobby' && (
                  <button type="button" className="arcade-btn arcade-btn-green" onClick={() => emit('casino:start_game')}>
                    ▶ START GAME
                  </button>
                )}
                {state?.meta.status === 'in_game' && (
                  <button type="button" className="arcade-btn arcade-btn-yellow" onClick={() => emit('casino:next_round')}>
                    ⏭ NEXT ROUND
                  </button>
                )}
                <button type="button" className="arcade-btn" onClick={() => sendHostAction('pause')}>⏸ PAUSE</button>
                <button type="button" className="arcade-btn" onClick={() => sendHostAction('resume')}>▶ RESUME</button>
                <button type="button" className="arcade-btn arcade-btn-red" onClick={() => sendHostAction('skip')}>⏩ SKIP</button>
              </div>

              {/* Player admin */}
              <div style={{ marginTop: 18 }}>
                <p className="arcade-label">PLAYERS</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {state?.players
                    .filter((p) => p.id !== me?.id)
                    .map((player) => (
                      <div
                        key={player.id}
                        style={{
                          border: '1px solid rgba(144,0,255,0.3)',
                          borderRadius: 2,
                          padding: '8px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <span style={{ fontFamily: 'var(--arc-arabic-font)', fontSize: '0.85rem', color: 'var(--arc-text)' }}>
                          {player.name}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="arcade-btn arcade-btn-green"
                            style={{ flex: 1, fontSize: '0.45rem', padding: '4px' }}
                            onClick={() => sendHostAction('score_adjust', { playerId: player.id, scoreDelta: 1 })}
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            className="arcade-btn arcade-btn-red"
                            style={{ flex: 1, fontSize: '0.45rem', padding: '4px' }}
                            onClick={() => sendHostAction('score_adjust', { playerId: player.id, scoreDelta: -1 })}
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            className="arcade-btn arcade-btn-red"
                            style={{ flex: 1, fontSize: '0.45rem', padding: '4px' }}
                            onClick={() => sendHostAction('kick', { playerId: player.id })}
                          >
                            KICK
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <p style={{ fontFamily: 'var(--arc-pixel-font)', fontSize: '0.5rem', color: 'var(--arc-text-soft)', marginBottom: 4 }}>
                  TARGET: {state?.targetScore ?? '-'} PTS
                </p>
                <p style={{ fontFamily: 'var(--arc-pixel-font)', fontSize: '0.5rem', color: 'var(--arc-text-soft)', marginBottom: 4 }}>
                  HOST: {state?.players.find((p) => p.isHost)?.name ?? '—'}
                </p>
                {state?.hostMode === 'ai' && (
                  <div style={{
                    display: 'inline-block',
                    background: 'rgba(0, 255, 255, 0.1)',
                    border: '1px solid var(--arc-neon-cyan)',
                    padding: '2px 6px',
                    marginTop: 4
                  }}>
                    <p style={{
                      fontFamily: 'var(--arc-pixel-font)',
                      fontSize: '0.5rem',
                      color: 'var(--arc-neon-cyan)',
                      margin: 0,
                      animation: 'blink 2s step-end infinite'
                    }}>
                      🤖 AI HOSTING ACTIVE
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

      </div>
    </div>
  );
}