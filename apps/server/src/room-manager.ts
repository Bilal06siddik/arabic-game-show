import {
  type BankRoomState,
  type CasinoRoomState,
  type CreateBankRoomInput,
  type CreateCasinoRoomInput,
  type GameType,
  type JoinRoomInput,
  type Language,
  type PieceColor,
  type Player,
  PIECE_COLORS,
  type RoomMetaView,
  type Session,
  ROOM_LIMITS,
} from '@ags/shared';
import type { BankRoomContext, CasinoRoomContext, RoomContext } from './types/room-records.js';
import { createId, createRoomCode, createSessionToken, now } from './lib/utils.js';

interface RoomServiceHook {
  onHostTransferred?(newHostId: string): void;
  onPlayerDisconnected?(playerId: string): void;
  onPlayerRemoved?(playerId: string): void;
  dispose?(): void;
}

interface CreateRoomResult {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

interface JoinResult {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  gameType: GameType;
}

export class RoomManager {
  private readonly casinoRooms = new Map<string, CasinoRoomContext>();
  private readonly bankRooms = new Map<string, BankRoomContext>();
  private readonly services = new Map<string, RoomServiceHook>();

  constructor(private readonly reconnectExpiryMs = 24 * 60 * 60 * 1000) { }

  registerService(roomCode: string, service: RoomServiceHook): void {
    this.services.set(roomCode, service);
  }

  unregisterService(roomCode: string): void {
    const service = this.services.get(roomCode);
    service?.dispose?.();
    this.services.delete(roomCode);
  }

  createCasinoRoom(input: CreateCasinoRoomInput): CreateRoomResult {
    const roomCode = this.generateUniqueRoomCode();
    const hostMode = this.resolveHostMode(input);
    const hostCanPlay = hostMode === 'player';
    const hostName = hostMode === 'ai' ? 'AI HOST' : input.hostName;

    const hostPlayer = this.buildHostPlayer(hostName, input.language, hostCanPlay);
    const timestamp = now();

    const state: CasinoRoomState = {
      gameType: 'casino',
      paused: false,
      targetScore: input.targetScore,
      hostMode,
      players: [hostPlayer],
      roundQueue: [],
      usedQuestionIds: {
        reversed: [],
        flag: [],
        trivia: [],
        drawing: [],
      },
      meta: {
        code: roomCode,
        gameType: 'casino',
        hostId: hostPlayer.id,
        status: 'lobby',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };

    const ctx: CasinoRoomContext = {
      state,
      sessionsByToken: new Map(),
      tokenByPlayerId: new Map(),
      reconnectExpiryMs: this.reconnectExpiryMs,
    };

    this.casinoRooms.set(roomCode, ctx);
    return this.issueSession(ctx, roomCode, hostPlayer.id);
  }

  createBankRoom(input: CreateBankRoomInput, board: BankRoomState['board']): CreateRoomResult {
    const roomCode = this.generateUniqueRoomCode();
    const hostMode = this.resolveHostMode(input);
    const hostCanPlay = hostMode === 'player';
    const hostPieceColor = hostCanPlay
      ? this.resolvePieceColor([], input.pieceColor)
      : undefined;
    const hostPlayer = this.buildHostPlayer(
      input.hostName,
      input.language,
      hostCanPlay,
      hostPieceColor,
    );
    const timestamp = now();

    const state: BankRoomState = {
      gameType: 'bank',
      paused: false,
      players: [hostPlayer],
      rulePreset: input.rulePreset,
      board,
      bankPlayers: [
        {
          playerId: hostPlayer.id,
          cash: 1500,
          position: 0,
          inJail: false,
          jailTurns: 0,
          doublesInRow: 0,
          bankrupt: false,
          assets: [],
        },
      ],
      openTradeOffers: [],
      freeParkingPot: 0,
      meta: {
        code: roomCode,
        gameType: 'bank',
        hostId: hostPlayer.id,
        status: 'lobby',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };

    const ctx: BankRoomContext = {
      state,
      sessionsByToken: new Map(),
      tokenByPlayerId: new Map(),
      reconnectExpiryMs: this.reconnectExpiryMs,
    };

    this.bankRooms.set(roomCode, ctx);
    return this.issueSession(ctx, roomCode, hostPlayer.id);
  }

  joinRoom(roomCode: string, payload: JoinRoomInput): JoinResult {
    const context = this.getRoomContext(roomCode);
    if (!context) {
      throw new Error('ROOM_NOT_FOUND');
    }

    const maxPlayers = ROOM_LIMITS[context.gameType];
    const playablePlayers = context.state.players.filter((player) => player.role === 'player');
    if (playablePlayers.length >= maxPlayers) {
      throw new Error('ROOM_FULL');
    }

    const playerId = createId('p');
    const seatIndex = playablePlayers.length;
    const pieceColor =
      context.gameType === 'bank'
        ? this.resolvePieceColor(context.state.players, payload.pieceColor)
        : undefined;
    const player: Player = {
      id: playerId,
      name: payload.name,
      role: 'player',
      seatIndex,
      isHost: false,
      connected: true,
      language: payload.language,
      pieceColor,
      score: 0,
      joinedAt: now(),
      lastSeenAt: now(),
    };

    context.state.players.push(player);
    context.state.meta.updatedAt = now();

    if (context.gameType === 'bank') {
      context.state.bankPlayers.push({
        playerId,
        cash: 1500,
        position: 0,
        inJail: false,
        jailTurns: 0,
        doublesInRow: 0,
        bankrupt: false,
        assets: [],
      });
    }

    const session = this.issueSession(context, roomCode, playerId);
    return {
      roomCode,
      playerId: session.playerId,
      sessionToken: session.sessionToken,
      gameType: context.gameType,
    };
  }

  reconnect(roomCode: string, sessionToken: string): { playerId: string; sessionToken: string } {
    const context = this.getRoomContext(roomCode);
    if (!context) {
      throw new Error('ROOM_NOT_FOUND');
    }

    const existingSession = context.sessionsByToken.get(sessionToken);
    if (!existingSession) {
      throw new Error('INVALID_SESSION');
    }
    if (existingSession.expiresAt < now()) {
      context.sessionsByToken.delete(sessionToken);
      context.tokenByPlayerId.delete(existingSession.playerId);
      throw new Error('INVALID_SESSION');
    }

    const player = context.state.players.find((item) => item.id === existingSession.playerId);
    if (!player) {
      throw new Error('INVALID_SESSION');
    }

    player.connected = true;
    player.lastSeenAt = now();
    context.state.meta.updatedAt = now();

    context.sessionsByToken.delete(sessionToken);
    const refreshed = this.issueSession(context, roomCode, player.id);
    return {
      playerId: refreshed.playerId,
      sessionToken: refreshed.sessionToken,
    };
  }

  validateSession(gameType: GameType, roomCode: string, playerId: string, sessionToken: string): boolean {
    const context = gameType === 'casino' ? this.casinoRooms.get(roomCode) : this.bankRooms.get(roomCode);
    if (!context) {
      return false;
    }

    const session = context.sessionsByToken.get(sessionToken);
    if (!session || session.playerId !== playerId) {
      return false;
    }

    if (session.expiresAt < now()) {
      context.sessionsByToken.delete(sessionToken);
      context.tokenByPlayerId.delete(playerId);
      return false;
    }

    const player = context.state.players.find((item) => item.id === playerId);
    if (!player) {
      return false;
    }

    player.connected = true;
    player.lastSeenAt = now();
    return true;
  }

  markDisconnected(gameType: GameType, roomCode: string, playerId: string): { newHostId?: string } {
    const context = gameType === 'casino' ? this.casinoRooms.get(roomCode) : this.bankRooms.get(roomCode);
    if (!context) {
      return {};
    }

    const player = context.state.players.find((entry) => entry.id === playerId);
    if (!player) {
      return {};
    }

    player.connected = false;
    player.lastSeenAt = now();

    const service = this.services.get(roomCode);
    service?.onPlayerDisconnected?.(playerId);

    if (!player.isHost) {
      return {};
    }

    const nextHost = context.state.players.find((entry) => entry.connected && entry.id !== playerId);
    if (!nextHost) {
      return {};
    }

    context.state.players.forEach((entry) => {
      entry.isHost = entry.id === nextHost.id;
      if (entry.id === nextHost.id && entry.role === 'host') {
        entry.role = 'player';
      }
    });

    context.state.meta.hostId = nextHost.id;
    context.state.meta.updatedAt = now();
    service?.onHostTransferred?.(nextHost.id);
    return { newHostId: nextHost.id };
  }

  removePlayer(gameType: GameType, roomCode: string, playerId: string): void {
    if (gameType === 'bank') {
      const context = this.bankRooms.get(roomCode);
      if (!context) {
        return;
      }
      const index = context.state.players.findIndex((player) => player.id === playerId);
      if (index === -1) {
        return;
      }

      const [removed] = context.state.players.splice(index, 1);
      context.state.players
        .filter((player) => player.role === 'player')
        .forEach((player, seatIndex) => {
          player.seatIndex = seatIndex;
        });

      context.state.bankPlayers = context.state.bankPlayers.filter((entry) => entry.playerId !== playerId);
      context.state.openTradeOffers = context.state.openTradeOffers.filter(
        (trade) => trade.fromPlayerId !== playerId && trade.toPlayerId !== playerId,
      );

      const token = context.tokenByPlayerId.get(playerId);
      if (token) {
        context.tokenByPlayerId.delete(playerId);
        context.sessionsByToken.delete(token);
      }

      if (removed.isHost && context.state.players.length > 0) {
        const next = context.state.players[0];
        context.state.players.forEach((player) => {
          player.isHost = player.id === next.id;
        });
        context.state.meta.hostId = next.id;
        this.services.get(roomCode)?.onHostTransferred?.(next.id);
      }

      context.state.meta.updatedAt = now();
      this.services.get(roomCode)?.onPlayerRemoved?.(playerId);
      return;
    }

    const context = this.casinoRooms.get(roomCode);
    if (!context) {
      return;
    }
    const index = context.state.players.findIndex((player) => player.id === playerId);
    if (index === -1) {
      return;
    }

    const [removed] = context.state.players.splice(index, 1);
    context.state.players
      .filter((player) => player.role === 'player')
      .forEach((player, seatIndex) => {
        player.seatIndex = seatIndex;
      });

    const token = context.tokenByPlayerId.get(playerId);
    if (token) {
      context.tokenByPlayerId.delete(playerId);
      context.sessionsByToken.delete(token);
    }

    if (removed.isHost && context.state.players.length > 0) {
      const next = context.state.players[0];
      context.state.players.forEach((player) => {
        player.isHost = player.id === next.id;
      });
      context.state.meta.hostId = next.id;
      this.services.get(roomCode)?.onHostTransferred?.(next.id);
    }

    context.state.meta.updatedAt = now();
    this.services.get(roomCode)?.onPlayerRemoved?.(playerId);
  }

  getCasinoRoom(roomCode: string): CasinoRoomContext | undefined {
    return this.casinoRooms.get(roomCode);
  }

  getBankRoom(roomCode: string): BankRoomContext | undefined {
    return this.bankRooms.get(roomCode);
  }

  getRoomMeta(roomCode: string): RoomMetaView | undefined {
    const context = this.getRoomContext(roomCode);
    if (!context) {
      return undefined;
    }

    const host = context.state.players.find((player) => player.id === context.state.meta.hostId);
    return {
      code: context.state.meta.code,
      gameType: context.gameType,
      status: context.state.meta.status,
      playersCount: context.state.players.length,
      hostName: host?.name,
    };
  }

  listRoomPlayers(gameType: GameType, roomCode: string): Player[] {
    const context = gameType === 'casino' ? this.casinoRooms.get(roomCode) : this.bankRooms.get(roomCode);
    if (!context) {
      return [];
    }
    return context.state.players;
  }

  listBankUsedColors(roomCode: string): PieceColor[] {
    const context = this.bankRooms.get(roomCode);
    if (!context) {
      throw new Error('ROOM_NOT_FOUND');
    }

    const used = new Set<PieceColor>();
    context.state.players.forEach((player) => {
      if (player.pieceColor) {
        used.add(player.pieceColor);
      }
    });
    return [...used];
  }

  private issueSession(
    context: RoomContext<{ players: Player[] }>,
    roomCode: string,
    playerId: string,
  ): CreateRoomResult {
    const token = createSessionToken();
    const session: Session = {
      token,
      playerId,
      roomCode,
      expiresAt: now() + context.reconnectExpiryMs,
    };

    const oldToken = context.tokenByPlayerId.get(playerId);
    if (oldToken) {
      context.sessionsByToken.delete(oldToken);
    }

    context.sessionsByToken.set(token, session);
    context.tokenByPlayerId.set(playerId, token);

    return {
      roomCode,
      playerId,
      sessionToken: token,
    };
  }

  private getRoomContext(roomCode: string):
    | ({ gameType: 'casino' } & CasinoRoomContext)
    | ({ gameType: 'bank' } & BankRoomContext)
    | undefined {
    const casino = this.casinoRooms.get(roomCode);
    if (casino) {
      return { gameType: 'casino', ...casino };
    }
    const bank = this.bankRooms.get(roomCode);
    if (bank) {
      return { gameType: 'bank', ...bank };
    }
    return undefined;
  }

  private generateUniqueRoomCode(): string {
    let attempt = createRoomCode();
    while (this.casinoRooms.has(attempt) || this.bankRooms.has(attempt)) {
      attempt = createRoomCode();
    }
    return attempt;
  }

  private resolvePieceColor(existingPlayers: Player[], preferred?: PieceColor): PieceColor {
    const used = new Set(existingPlayers.map((player) => player.pieceColor).filter(Boolean));
    if (preferred) {
      if (used.has(preferred)) {
        throw new Error('PIECE_COLOR_TAKEN');
      }
      return preferred;
    }

    const available = PIECE_COLORS.find((color) => !used.has(color));
    if (!available) {
      throw new Error('ROOM_FULL');
    }
    return available;
  }

  private buildHostPlayer(
    hostName: string,
    language: Language,
    hostCanPlay: boolean,
    pieceColor?: PieceColor,
  ): Player {
    return {
      id: createId('host'),
      name: hostName,
      role: hostCanPlay ? 'player' : 'host',
      seatIndex: hostCanPlay ? 0 : -1,
      isHost: true,
      connected: true,
      language,
      pieceColor,
      score: 0,
      joinedAt: now(),
      lastSeenAt: now(),
    };
  }

  private resolveHostMode(
    input: {
      hostMode: 'player' | 'moderator' | 'ai';
    } | {
      hostCanPlay?: boolean;
      hostMode?: 'player' | 'moderator' | 'ai';
    },
  ): 'player' | 'moderator' | 'ai' {
    if (input.hostMode) {
      return input.hostMode;
    }

    return input.hostCanPlay === false ? 'moderator' : 'player';
  }
}
