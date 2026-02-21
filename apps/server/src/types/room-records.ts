import type {
  BankRoomState,
  CasinoRoomState,
  Session,
  SocketAuthPayload,
} from '@ags/shared';

export interface RoomContext<TState> {
  state: TState;
  sessionsByToken: Map<string, Session>;
  tokenByPlayerId: Map<string, string>;
  reconnectExpiryMs: number;
}

export interface CasinoRoomContext extends RoomContext<CasinoRoomState> {}

export interface BankRoomContext extends RoomContext<BankRoomState> {}

export interface VerifiedSocketAuth {
  payload: SocketAuthPayload;
}