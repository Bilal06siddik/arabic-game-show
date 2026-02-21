import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/PageLayout';
import { useLanguage } from '../components/LanguageProvider';
import { createCasinoRoom, joinRoom } from '../lib/api';
import { saveSession } from '../lib/session';

export function CasinoLobbyPage(): JSX.Element {
  const { language, tr } = useLanguage();
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [targetScore, setTargetScore] = useState(10);
  const [hostCanPlay, setHostCanPlay] = useState(true);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function onCreateRoom(): Promise<void> {
    try {
      setLoading(true);
      setError('');
      const response = await createCasinoRoom({
        hostName,
        language,
        hostCanPlay,
        targetScore,
      });

      saveSession({
        roomCode: response.roomCode,
        gameType: 'casino',
        playerId: response.playerId,
        sessionToken: response.sessionToken,
        name: hostName,
        language,
      });

      navigate(`/casino/${response.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  }

  async function onJoinRoom(): Promise<void> {
    try {
      setLoading(true);
      setError('');
      const response = await joinRoom(roomCode, {
        name: joinName,
        language,
      });

      if (response.gameType !== 'casino') {
        throw new Error('This room is not a casino room.');
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
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout title={tr('casino.title')} backTo="/">
      <div className="panel-grid">
        <section className="panel">
          <h2>{tr('common.create')}</h2>
          <label>
            {tr('common.name')}
            <input value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={24} />
          </label>
          <label>
            {tr('casino.targetScore')}
            <select
              value={targetScore}
              onChange={(event) => setTargetScore(Number(event.target.value))}
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hostCanPlay}
              onChange={(event) => setHostCanPlay(event.target.checked)}
            />
            {tr('common.hostCanPlay')}
          </label>
          <button type="button" className="primary-btn" disabled={loading || !hostName.trim()} onClick={onCreateRoom}>
            {tr('common.create')}
          </button>
        </section>

        <section className="panel">
          <h2>{tr('common.join')}</h2>
          <label>
            {tr('common.name')}
            <input value={joinName} onChange={(event) => setJoinName(event.target.value)} maxLength={24} />
          </label>
          <label>
            {tr('common.roomCode')}
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              maxLength={8}
            />
          </label>
          <button
            type="button"
            className="primary-btn"
            disabled={loading || !joinName.trim() || roomCode.trim().length < 4}
            onClick={onJoinRoom}
          >
            {tr('common.join')}
          </button>
        </section>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </PageLayout>
  );
}