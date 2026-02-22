import { useEffect, useState } from 'react';
import { PIECE_COLORS, type PieceColor } from '@ags/shared';
import { useNavigate } from 'react-router-dom';
import { BankPieceColorPicker } from '../components/BankPieceColorPicker';
import { BankShellLayout } from '../components/BankShellLayout';
import { useLanguage } from '../components/LanguageProvider';
import { createBankRoom, getBankUsedColors, joinRoom } from '../lib/api';
import { saveSession } from '../lib/session';

export function BankLobbyPage(): JSX.Element {
  const { language, tr } = useLanguage();
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [rulePreset, setRulePreset] = useState<'official' | 'house'>('official');
  const [hostMode, setHostMode] = useState<'player' | 'moderator' | 'ai'>('player');
  const [hostPieceColor, setHostPieceColor] = useState<PieceColor>('red');
  const [joinPieceColor, setJoinPieceColor] = useState<PieceColor>('blue');
  const [usedJoinColors, setUsedJoinColors] = useState<PieceColor[]>([]);
  const hostCanPlay = hostMode === 'player';
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (roomCode.trim().length < 4) {
      setUsedJoinColors([]);
      return () => undefined;
    }

    getBankUsedColors(roomCode)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setUsedJoinColors(response.usedColors);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setUsedJoinColors([]);
      });

    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  useEffect(() => {
    if (!usedJoinColors.includes(joinPieceColor)) {
      return;
    }
    const fallback = PIECE_COLORS.find((color) => !usedJoinColors.includes(color));
    if (fallback) {
      setJoinPieceColor(fallback);
    }
  }, [joinPieceColor, usedJoinColors]);

  async function onCreateRoom(): Promise<void> {
    try {
      setLoading(true);
      setError('');
      const response = await createBankRoom({
        hostName,
        language,
        hostMode,
        rulePreset,
        pieceColor: hostPieceColor,
      });

      saveSession({
        roomCode: response.roomCode,
        gameType: 'bank',
        playerId: response.playerId,
        sessionToken: response.sessionToken,
        name: hostName,
        language,
        pieceColor: hostPieceColor,
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
        pieceColor: joinPieceColor,
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
        pieceColor: joinPieceColor,
      });

      navigate(`/bank/${response.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BankShellLayout subtitle={tr('bank.onboardingHint')}>
      <section className="bank-lobby-hero">
        <p className="bank-lobby-kicker">BANK ALHAZ</p>
        <h2>{tr('bank.title')}</h2>
        <p>{tr('bank.onboardingHint')}</p>
        <div className="bank-lobby-meta">
          <span>{tr('common.create')}</span>
          <span>{tr('common.join')}</span>
          <span>{tr('bank.rulePreset')}</span>
        </div>
      </section>

      <div className="bank-lobby-grid">
        <section className="bank-panel bank-panel-create bank-lobby-panel">
          <header className="bank-panel-header">
            <p className="bank-panel-kicker">01</p>
            <h2>{tr('common.create')}</h2>
            <p className="bank-panel-hint">{tr('bank.onboardingHint')}</p>
          </header>
          <label className="bank-field">
            <span className="bank-label">{tr('common.name')}</span>
            <input value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={24} />
          </label>
          <BankPieceColorPicker
            value={hostPieceColor}
            onChange={setHostPieceColor}
            disabled={!hostCanPlay}
          />
          <label className="bank-field">
            <span className="bank-label">{tr('bank.rulePreset')}</span>
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

        <section className="bank-panel bank-panel-join bank-lobby-panel">
          <header className="bank-panel-header">
            <p className="bank-panel-kicker">02</p>
            <h2>{tr('common.join')}</h2>
            <p className="bank-panel-hint">{tr('bank.onboardingTitle')}</p>
          </header>
          <label className="bank-field">
            <span className="bank-label">{tr('common.name')}</span>
            <input value={joinName} onChange={(event) => setJoinName(event.target.value)} maxLength={24} />
          </label>
          <BankPieceColorPicker
            value={joinPieceColor}
            onChange={setJoinPieceColor}
            unavailableColors={usedJoinColors}
          />
          <label className="bank-field">
            <span className="bank-label">{tr('common.roomCode')}</span>
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              maxLength={8}
            />
          </label>
          <button
            type="button"
            className="primary-btn"
            disabled={
              loading ||
              !joinName.trim() ||
              roomCode.trim().length < 4 ||
              usedJoinColors.includes(joinPieceColor)
            }
            onClick={onJoinRoom}
          >
            {tr('common.join')}
          </button>
        </section>
      </div>
      {error ? <p className="error-text bank-lobby-error">{error}</p> : null}
    </BankShellLayout>
  );
}
