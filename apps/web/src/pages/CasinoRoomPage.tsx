import type { CasinoRoomState, DrawingPrompt } from '@ags/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { DrawingPad } from '../components/DrawingPad';
import { useLanguage } from '../components/LanguageProvider';
import { PageLayout } from '../components/PageLayout';
import { reconnectRoom } from '../lib/api';
import { readSession, saveSession, type RoomSession } from '../lib/session';
import { createRoomSocket } from '../lib/socket';

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

  useEffect(() => {
    if (!session) {
      return;
    }

    const socket = createRoomSocket('casino', {
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

    socket.on('room:state_sync', (payload: { state: CasinoRoomState }) => {
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

  const round = state?.currentRound;
  const drawingState = round?.type === 'drawing' ? round.drawing : undefined;
  const isHost = Boolean(me?.isHost);

  function emit(event: string, payload?: unknown): void {
    socketRef.current?.emit(event, payload);
  }

  function sendHostAction(action: 'pause' | 'resume' | 'skip' | 'kick' | 'score_adjust', payload?: unknown): void {
    emit('casino:host_action', {
      action,
      payload,
    });
  }

  if (!session) {
    return (
      <PageLayout title={tr('casino.title')} backTo="/casino">
        <section className="panel">
          <p>No local session found for room {roomCode}.</p>
          <button type="button" className="primary-btn" onClick={() => navigate('/casino')}>
            {tr('common.back')}
          </button>
        </section>
      </PageLayout>
    );
  }

  const timedRound = round && round.type !== 'drawing' ? round : undefined;
  const buzzerEligible =
    timedRound &&
    me?.role === 'player' &&
    timedRound.buzzerWindowId &&
    !timedRound.buzzedPlayerId &&
    !timedRound.answerRevealed &&
    !timedRound.excludedPlayerIds.includes(me.id);

  const isMyAnswerTurn = timedRound && timedRound.buzzedPlayerId === me?.id;
  const currentDrawer = drawingState ? drawingState.drawerOrder[drawingState.currentDrawerIndex] : undefined;
  const currentVoter = drawingState ? drawingState.votingPlayerOrder[drawingState.currentVoterIndex] : undefined;
  const drawingWord = round?.question.type === 'drawing' ? (round.question as DrawingPrompt).word : '';

  return (
    <PageLayout title={tr('casino.title')} subtitle={`Room ${session.roomCode}`} backTo="/casino">
      <div className="room-grid">
        <section className="panel">
          <h2>{tr('common.status')}</h2>
          <p>
            {connected ? 'Connected' : tr('common.notConnected')} | {state?.meta.status ?? 'loading'}
          </p>
          <p>Host: {state?.players.find((player) => player.isHost)?.name ?? '—'}</p>
          <p>Target: {state?.targetScore ?? '-'}</p>
          {error ? <p className="error-text">{error}</p> : null}

          <div className="score-grid">
            {state?.players
              .filter((player) => player.role === 'player')
              .map((player) => (
                <article key={player.id} className={`score-card ${player.id === me?.id ? 'self' : ''}`}>
                  <h4>{player.name}</h4>
                  <p>{player.score ?? 0}</p>
                </article>
              ))}
          </div>
        </section>

        <section className="panel">
          <h2>Round</h2>
          {!round ? <p>Waiting for host to start.</p> : null}

          {round?.type === 'reversed' ? (
            <div className="question-block">
              <h3>Reversed Word</h3>
              <p className="big-text">{(round.question as { reversed: string }).reversed}</p>
            </div>
          ) : null}

          {round?.type === 'flag' ? (
            <div className="question-block">
              <h3>Flag</h3>
              <img
                className="flag-image"
                src={`https://flagcdn.com/w320/${(round.question as { countryCode: string }).countryCode}.png`}
                alt="flag"
              />
            </div>
          ) : null}

          {round?.type === 'trivia' ? (
            <div className="question-block">
              <h3>Trivia</h3>
              <p>{(round.question as { question: string }).question}</p>
            </div>
          ) : null}

          {timedRound?.answerRevealed ? (
            <p className="notice-text">Answer: {timedRound.revealedAnswer ?? (timedRound.question as { answer: string }).answer}</p>
          ) : null}

          {buzzerEligible ? (
            <button
              type="button"
              className="danger-btn"
              onClick={() => emit('casino:buzz_press', { windowId: timedRound?.buzzerWindowId })}
            >
              {tr('casino.buzz')}
            </button>
          ) : null}

          {isMyAnswerTurn ? (
            <div className="answer-box">
              <input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={tr('casino.answer')}
              />
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  emit('casino:answer_submit', { answer });
                  setAnswer('');
                }}
              >
                {tr('casino.submitAnswer')}
              </button>
            </div>
          ) : null}

          {round?.type === 'drawing' && drawingState ? (
            <div className="drawing-section">
              <p>Draw word: {me?.id === currentDrawer || isHost ? drawingWord : '***'}</p>
              <p>Phase: {drawingState.phase}</p>

              {drawingState.phase === 'drawing' ? (
                me?.id === currentDrawer ? (
                  <DrawingPad
                    onSubmit={(imageDataUrl) => emit('casino:drawing_submit', { imageDataUrl })}
                  />
                ) : (
                  <p>Waiting for drawer...</p>
                )
              ) : null}

              {drawingState.phase === 'voting' ? (
                <div className="vote-grid">
                  {drawingState.submissions.map((submission) => {
                    const author = state?.players.find((player) => player.id === submission.playerId);
                    const disabled = me?.id !== currentVoter || submission.playerId === me?.id;
                    return (
                      <article key={submission.playerId} className="vote-card">
                        <img src={submission.imageDataUrl} alt="drawing" />
                        <p>{author?.name ?? submission.playerId}</p>
                        <button
                          type="button"
                          className="primary-btn"
                          disabled={disabled}
                          onClick={() => emit('casino:vote_cast', { targetPlayerId: submission.playerId })}
                        >
                          {tr('casino.vote')}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {isHost ? (
            <div className="host-controls">
              {state?.meta.status === 'lobby' ? (
                <button type="button" className="primary-btn" onClick={() => emit('casino:start_game')}>
                  {tr('casino.startGame')}
                </button>
              ) : null}

              {state?.meta.status === 'in_game' ? (
                <button type="button" className="secondary-btn" onClick={() => emit('casino:next_round')}>
                  {tr('casino.nextRound')}
                </button>
              ) : null}

              <button type="button" className="secondary-btn" onClick={() => sendHostAction('pause')}>
                Pause
              </button>
              <button type="button" className="secondary-btn" onClick={() => sendHostAction('resume')}>
                Resume
              </button>
              <button type="button" className="secondary-btn" onClick={() => sendHostAction('skip')}>
                Skip
              </button>

              <div className="player-admin-list">
                {state?.players
                  .filter((player) => player.id !== me?.id)
                  .map((player) => (
                    <div key={player.id} className="player-admin-item">
                      <span>{player.name}</span>
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => sendHostAction('kick', { playerId: player.id })}
                      >
                        Kick
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => sendHostAction('score_adjust', { playerId: player.id, scoreDelta: 1 })}
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => sendHostAction('score_adjust', { playerId: player.id, scoreDelta: -1 })}
                      >
                        -1
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
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