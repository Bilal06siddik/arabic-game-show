import type { GameType, Language, PieceColor } from '@ags/shared';

export interface RoomSession {
  roomCode: string;
  gameType: GameType;
  playerId: string;
  sessionToken: string;
  name: string;
  language: Language;
  pieceColor?: PieceColor;
}

function key(gameType: GameType, roomCode: string): string {
  return `ags.session.${gameType}.${roomCode.toUpperCase()}`;
}

export function saveSession(session: RoomSession): void {
  window.localStorage.setItem(key(session.gameType, session.roomCode), JSON.stringify(session));
}

export function readSession(gameType: GameType, roomCode: string): RoomSession | undefined {
  const raw = window.localStorage.getItem(key(gameType, roomCode));
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as RoomSession;
    return parsed;
  } catch {
    return undefined;
  }
}

export function clearSession(gameType: GameType, roomCode: string): void {
  window.localStorage.removeItem(key(gameType, roomCode));
}
