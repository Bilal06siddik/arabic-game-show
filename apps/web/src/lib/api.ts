import type { GameType, Language } from '@ags/shared';

export interface CreateRoomResponse {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  gameType: GameType;
}

export interface JoinRoomResponse {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  gameType: GameType;
}

export interface ReconnectResponse {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  gameType: GameType;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const json = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error((json as { message?: string }).message ?? 'Request failed');
  }

  return json as T;
}

export function createCasinoRoom(payload: {
  hostName: string;
  language: Language;
  hostCanPlay: boolean;
  targetScore: number;
}): Promise<CreateRoomResponse> {
  return request<CreateRoomResponse>('/api/casino/rooms/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createBankRoom(payload: {
  hostName: string;
  language: Language;
  hostCanPlay: boolean;
  rulePreset: 'official' | 'house';
}): Promise<CreateRoomResponse> {
  return request<CreateRoomResponse>('/api/bank/rooms/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function joinRoom(
  roomCode: string,
  payload: { name: string; language: Language },
): Promise<JoinRoomResponse> {
  return request<JoinRoomResponse>(`/api/rooms/${roomCode.toUpperCase()}/join`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function reconnectRoom(
  roomCode: string,
  payload: { sessionToken: string },
): Promise<ReconnectResponse> {
  return request<ReconnectResponse>(`/api/rooms/${roomCode.toUpperCase()}/reconnect`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getRoomMeta(roomCode: string): Promise<{
  code: string;
  gameType: GameType;
  status: string;
  playersCount: number;
  hostName?: string;
}> {
  return request(`/api/rooms/${roomCode.toUpperCase()}/meta`);
}

export { API_BASE };