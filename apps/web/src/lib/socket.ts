import type { GameType } from '@ags/shared';
import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './api';

function namespaceFor(gameType: GameType): '/casino' | '/bank' {
  return gameType === 'casino' ? '/casino' : '/bank';
}

export function createRoomSocket(
  gameType: GameType,
  auth: {
    roomCode: string;
    playerId: string;
    sessionToken: string;
  },
): Socket {
  return io(`${API_BASE}${namespaceFor(gameType)}`, {
    transports: ['websocket', 'polling'],
    auth: {
      roomCode: auth.roomCode.toUpperCase(),
      playerId: auth.playerId,
      sessionToken: auth.sessionToken,
      gameType,
    },
    autoConnect: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 800,
  });
}