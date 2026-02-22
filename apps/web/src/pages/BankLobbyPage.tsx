import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/PageLayout';
import { useLanguage } from '../components/LanguageProvider';
import { createBankRoom, joinRoom } from '../lib/api';
import { saveSession } from '../lib/session';

export function BankLobbyPage(): JSX.Element {
  const { language, tr } = useLanguage();
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [rulePreset, setRulePreset] = useState<'official' | 'house'>('official');
  const [hostMode, setHostMode] = useState<'player' | 'moderator' | 'ai'>('player');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function onCreateRoom(): Promise<void> {
    try {
      setLoading(true);
      setError('');
      const response = await createBankRoom({
        hostName,
        language,
        hostMode,
        rulePreset,
      });

      saveSession({
        roomCode: response.roomCode,
        gameType: 'bank',
        playerId: response.playerId,
        sessionToken: response.sessionToken,
        name: hostName,
        language,
      });

      navigate(`/bank/${response.roomCode}`);
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

      if (response.gameType !== 'bank') {
        throw new Error('This room is not a bank room.');
      }

      saveSession({
        roomCode: response.roomCode,
        gameType: 'bank',
        playerId: response.playerId,
        sessionToken: response.sessionToken,
        name: joinName,
        language,
      });

      navigate(`/bank/${response.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout title={tr('bank.title')} backTo="/">
      <div className="panel-grid">
        <section className="panel">
          <h2>{tr('common.create')}</h2>
          <label>
            {tr('common.name')}
            <input value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={24} />
          </label>
          <label>
            {tr('bank.rulePreset')}
            <select
              value={rulePreset}
              onChange={(event) => setRulePreset(event.target.value as 'official' | 'house')}
            >
              <option value="official">{tr('bank.official')}</option>
              <option value="house">{tr('bank.house')}</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hostMode === 'player'}
              onChange={(event) => setHostMode(event.target.checked ? 'player' : 'moderator')}
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