import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../components/LanguageProvider';
import { createCasinoRoom, joinRoom } from '../lib/api';
import { saveSession } from '../lib/session';
import '../styles/casino-arcade.css';

export function CasinoLobbyPage(): JSX.Element {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [targetScore, setTargetScore] = useState(10);
  const [hostMode, setHostMode] = useState<'player' | 'moderator' | 'ai'>('player');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function onCreateRoom(): Promise<void> {
    try {
      setLoading(true);
      setError('');
      const response = await createCasinoRoom({
        hostName: hostMode === 'ai' ? 'AI HOST' : hostName,
        language,
        hostMode,
        targetScore,
      });

      saveSession({
        roomCode: response.roomCode,
        gameType: 'casino',
        playerId: response.playerId,
        sessionToken: response.sessionToken,
        name: hostMode === 'ai' ? 'AI HOST' : hostName,
        language,
      });

      navigate(`/casino/${response.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'FAILED TO CREATE ROOM');
    } finally {
      setLoading(false);
    }
  }
  async function onJoinRoom(): Promise<void> {
    try {
      setLoading(true);
      setError('');
      const response = await joinRoom(roomCode, { name: joinName, language });

      if (response.gameType !== 'casino') {
        throw new Error('THIS ROOM IS NOT A CASINO ROOM.');
      }

      saveSession({
        roomCode: response.roomCode,
        gameType: 'casino',
        playerId: response.playerId,
        sessionToken: response.sessionToken,
        name: joinName,
        language,
      });

      navigate(`/casino/${response.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'FAILED TO JOIN ROOM');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="arcade-root">
      <div className="arcade-lobby-layout">

        {/* Header */}
        <div className="arcade-lobby-header">
          <h1 className="arcade-title">🎰 CASINO AL3AB 🎰</h1>
          <p className="arcade-subtitle">كازينو الألعاب</p>
          <p className="insert-coin">▶ INSERT COIN TO PLAY ◀</p>

          <a href="/" style={{ alignSelf: 'flex-start', display: 'inline-block' }}>
            <button type="button" className="arcade-btn" style={{ fontSize: '0.5rem', padding: '8px 14px' }}>
              ◀ BACK
            </button>
          </a>
        </div>

        {/* Panels */}
        <div className="arcade-lobby-panels">

          {/* Create Room */}
          <div className="arcade-panel">
            <h2 className="arcade-panel-title">▶ CREATE ROOM</h2>

            <div className="arcade-form-group">
              <label className="arcade-label">YOUR NAME</label>
              <input
                className="arcade-input"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                maxLength={24}
                placeholder="Enter your name..."
                disabled={hostMode === 'ai'}
                dir="auto"
              />
            </div>

            <div className="arcade-form-group">
              <label className="arcade-label">TARGET SCORE</label>
              <select
                className="arcade-select"
                value={targetScore}
                onChange={(e) => setTargetScore(Number(e.target.value))}
              >
                <option value={10}>10 POINTS</option>
                <option value={15}>15 POINTS</option>
                <option value={20}>20 POINTS</option>
              </select>
            </div>

            <div className="arcade-form-group">
              <label className="arcade-label">HOST MODE</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  className={`arcade-btn-mini ${hostMode === 'player' ? 'active' : ''}`}
                  onClick={() => setHostMode('player')}
                >
                  🎮 PLAYER & HOST
                </button>
                <button
                  type="button"
                  className={`arcade-btn-mini ${hostMode === 'moderator' ? 'active' : ''}`}
                  onClick={() => setHostMode('moderator')}
                >
                  👁️ MODERATOR ONLY
                </button>
                <button
                  type="button"
                  className={`arcade-btn-mini ${hostMode === 'ai' ? 'active' : ''}`}
                  onClick={() => setHostMode('ai')}
                >
                  🤖 AI HOST (AUTO)
                </button>
              </div>
            </div>

            <button
              type="button"
              className="arcade-btn arcade-btn-yellow"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading || (hostMode !== 'ai' && !hostName.trim())}
              onClick={onCreateRoom}
            >
              {loading ? '...' : '🎮 CREATE ROOM'}
            </button>
          </div>

          {/* Join Room */}
          <div className="arcade-panel">
            <h2 className="arcade-panel-title">◀ JOIN ROOM</h2>

            <div className="arcade-form-group">
              <label className="arcade-label">YOUR NAME</label>
              <input
                className="arcade-input"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                maxLength={24}
                placeholder="Enter your name..."
                dir="auto"
              />
            </div>

            <div className="arcade-form-group">
              <label className="arcade-label">ROOM CODE</label>
              <input
                className="arcade-input"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="XXXXXX"
                style={{ letterSpacing: '6px', textAlign: 'center', fontFamily: 'var(--arc-pixel-font)', fontSize: '1rem' }}
              />
            </div>

            <button
              type="button"
              className="arcade-btn arcade-btn-green"
              style={{ width: '100%', marginTop: 8 }}
              disabled={loading || !joinName.trim() || roomCode.trim().length < 4}
              onClick={onJoinRoom}
            >
              {loading ? '...' : '▶ JOIN ROOM'}
            </button>
          </div>
        </div>

        {error && <p className="arcade-error">{error}</p>}

        {/* Mini-game legend */}
        <div className="arcade-panel" style={{ textAlign: 'center' }}>
          <p className="arcade-label" style={{ marginBottom: 16 }}>GAME MODES</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="round-type-badge drawing">🎨 Drawing Showdown</span>
            <span className="round-type-badge reversed">🔤 الكلمات المعكوسة</span>
            <span className="round-type-badge flag">🏳️ Flags & Pictures</span>
            <span className="round-type-badge trivia">❓ Trivia</span>
          </div>
        </div>

      </div>
    </div>
  );
}