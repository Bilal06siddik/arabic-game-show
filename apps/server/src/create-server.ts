import http from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  ERROR_CODES,
  NAMESPACES,
  bankAuctionBidSchema,
  bankBuySchema,
  bankHostActionSchema,
  bankHouseActionSchema,
  bankMortgageSchema,
  bankTradeDecisionSchema,
  bankTradeProposalSchema,
  casinoAnswerSubmitSchema,
  casinoBuzzPressSchema,
  casinoDrawingSubmitSchema,
  casinoDrawingVoteSchema,
  casinoHostActionSchema,
  createBankRoomSchema,
  createCasinoRoomSchema,
  joinRoomSchema,
  reconnectSchema,
  socketAuthSchema,
  type GameType,
} from '@ags/shared';
import { Server } from 'socket.io';
import { ZodError, type ZodTypeAny } from 'zod';
import { logger } from './lib/logger.js';
import { loadCasinoContent, loadEgyptBoard } from './lib/content-loader.js';
import { RoomManager } from './room-manager.js';
import { BankGameService } from './services/bank-game.js';
import { CasinoGameService } from './services/casino-game.js';

interface AppRuntime {
  app: express.Express;
  httpServer: http.Server;
  io: Server;
  roomManager: RoomManager;
  close: () => Promise<void>;
}

function parseBody<T extends ZodTypeAny>(schema: T, payload: unknown) {
  const parsed = schema.parse(payload);
  return parsed;
}

function toErrorCode(error: unknown): string {
  if (error instanceof ZodError) {
    return ERROR_CODES.invalidPayload;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'UNKNOWN_ERROR';
}

function createSocketErrorPayload(error: unknown) {
  return {
    code: toErrorCode(error),
    message: error instanceof Error ? error.message : 'Unknown error',
  };
}

export function createAppRuntime(): AppRuntime {
  const app = express();
  const httpServer = http.createServer(app);

  const origin = process.env.CORS_ORIGIN ?? '*';
  const io = new Server(httpServer, {
    cors: {
      origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(
    cors({
      origin,
      credentials: true,
    }),
  );

  const roomManager = new RoomManager();
  const casinoServices = new Map<string, CasinoGameService>();
  const bankServices = new Map<string, BankGameService>();

  const casinoContent = loadCasinoContent();
  const egyptBoard = loadEgyptBoard();

  function emitCasinoState(roomCode: string): void {
    const room = roomManager.getCasinoRoom(roomCode);
    if (!room) {
      return;
    }
    io.of(NAMESPACES.casino).to(roomCode).emit('room:state_sync', {
      roomCode,
      state: room.state,
      serverTime: Date.now(),
    });
  }

  function emitBankState(roomCode: string): void {
    const room = roomManager.getBankRoom(roomCode);
    if (!room) {
      return;
    }
    io.of(NAMESPACES.bank).to(roomCode).emit('room:state_sync', {
      roomCode,
      state: room.state,
      serverTime: Date.now(),
    });
  }

  function emitRoomError(socket: { emit: (event: string, payload: unknown) => void }, error: unknown): void {
    socket.emit('room:error', createSocketErrorPayload(error));
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.post('/api/casino/rooms/create', (req, res, next) => {
    try {
      const payload = parseBody(createCasinoRoomSchema, req.body);
      const created = roomManager.createCasinoRoom(payload);
      const room = roomManager.getCasinoRoom(created.roomCode);
      if (!room) {
        throw new Error('ROOM_NOT_FOUND');
      }

      const service = new CasinoGameService({
        roomCode: created.roomCode,
        state: room.state,
        content: casinoContent,
        emit: (event, eventPayload) => {
          io.of(NAMESPACES.casino).to(created.roomCode).emit(event, eventPayload);
        },
        removePlayer: (playerId) => {
          roomManager.removePlayer('casino', created.roomCode, playerId);
          emitCasinoState(created.roomCode);
        },
        onStateChange: () => emitCasinoState(created.roomCode),
      });

      casinoServices.set(created.roomCode, service);
      roomManager.registerService(created.roomCode, {
        onHostTransferred: (newHostId) => service.onHostTransferred(newHostId),
        onPlayerDisconnected: (playerId) => service.onPlayerDisconnected(playerId),
        onPlayerRemoved: (playerId) => service.onPlayerRemoved(playerId),
        dispose: () => service.dispose(),
      });

      logger.info('casino_room_created', {
        roomCode: created.roomCode,
        hostPlayerId: created.playerId,
      });

      res.status(201).json({
        ...created,
        gameType: 'casino',
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bank/rooms/create', (req, res, next) => {
    try {
      const payload = parseBody(createBankRoomSchema, req.body);
      const created = roomManager.createBankRoom(payload, egyptBoard);
      const room = roomManager.getBankRoom(created.roomCode);
      if (!room) {
        throw new Error('ROOM_NOT_FOUND');
      }

      const service = new BankGameService({
        roomCode: created.roomCode,
        state: room.state,
        emit: (event, eventPayload) => {
          io.of(NAMESPACES.bank).to(created.roomCode).emit(event, eventPayload);
        },
        removePlayer: (playerId) => {
          roomManager.removePlayer('bank', created.roomCode, playerId);
          emitBankState(created.roomCode);
        },
        onStateChange: () => emitBankState(created.roomCode),
      });

      bankServices.set(created.roomCode, service);
      roomManager.registerService(created.roomCode, {
        onHostTransferred: () => service.onHostTransferred(),
        onPlayerDisconnected: (playerId) => service.onPlayerDisconnected(playerId),
        onPlayerRemoved: (playerId) => service.onPlayerRemoved(playerId),
        dispose: () => service.dispose(),
      });

      logger.info('bank_room_created', {
        roomCode: created.roomCode,
        hostPlayerId: created.playerId,
      });

      res.status(201).json({
        ...created,
        gameType: 'bank',
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rooms/:code/join', (req, res, next) => {
    try {
      const roomCode = String(req.params.code ?? '').toUpperCase();
      const payload = parseBody(joinRoomSchema, req.body);
      const joined = roomManager.joinRoom(roomCode, payload);

      if (joined.gameType === 'casino') {
        emitCasinoState(roomCode);
      } else {
        emitBankState(roomCode);
      }

      logger.info('room_join', {
        roomCode,
        playerId: joined.playerId,
        gameType: joined.gameType,
      });

      res.status(200).json(joined);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/rooms/:code/meta', (req, res, next) => {
    try {
      const roomCode = String(req.params.code ?? '').toUpperCase();
      const meta = roomManager.getRoomMeta(roomCode);
      if (!meta) {
        res.status(404).json({ code: ERROR_CODES.roomNotFound, message: 'Room not found' });
        return;
      }
      res.json(meta);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/rooms/:code/reconnect', (req, res, next) => {
    try {
      const roomCode = String(req.params.code ?? '').toUpperCase();
      const payload = parseBody(reconnectSchema, req.body);
      const session = roomManager.reconnect(roomCode, payload.sessionToken);
      const meta = roomManager.getRoomMeta(roomCode);
      if (!meta) {
        throw new Error('ROOM_NOT_FOUND');
      }

      if (meta.gameType === 'casino') {
        emitCasinoState(roomCode);
      } else {
        emitBankState(roomCode);
      }

      res.status(200).json({
        ...session,
        roomCode,
        gameType: meta.gameType,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const errorCode = toErrorCode(error);
    logger.warn('http_error', {
      errorCode,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    const status =
      errorCode === ERROR_CODES.roomNotFound || errorCode === 'ROOM_NOT_FOUND'
        ? 404
        : errorCode === ERROR_CODES.invalidPayload
          ? 400
          : errorCode === ERROR_CODES.forbidden || errorCode === 'FORBIDDEN'
            ? 403
            : 400;

    res.status(status).json({
      code: errorCode,
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof ZodError ? error.flatten() : undefined,
    });
  });

  io.of(NAMESPACES.casino).use((socket, next) => {
    try {
      const parsed = socketAuthSchema.parse(socket.handshake.auth);
      if (!roomManager.validateSession('casino', parsed.roomCode, parsed.playerId, parsed.sessionToken)) {
        next(new Error(ERROR_CODES.invalidSession));
        return;
      }
      socket.data.auth = parsed;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.of(NAMESPACES.bank).use((socket, next) => {
    try {
      const parsed = socketAuthSchema.parse(socket.handshake.auth);
      if (!roomManager.validateSession('bank', parsed.roomCode, parsed.playerId, parsed.sessionToken)) {
        next(new Error(ERROR_CODES.invalidSession));
        return;
      }
      socket.data.auth = parsed;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.of(NAMESPACES.casino).on('connection', (socket) => {
    const auth = socket.data.auth as {
      roomCode: string;
      playerId: string;
      sessionToken: string;
      gameType: GameType;
    };

    const roomCode = auth.roomCode;
    const playerId = auth.playerId;
    const service = casinoServices.get(roomCode);
    if (!service) {
      socket.emit('room:error', {
        code: ERROR_CODES.roomNotFound,
        message: 'Room not found',
      });
      socket.disconnect(true);
      return;
    }

    socket.join(roomCode);
    emitCasinoState(roomCode);

    socket.on('casino:start_game', () => {
      try {
        service.startGame(playerId);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('casino:next_round', () => {
      try {
        service.nextRound(playerId);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('casino:buzz_press', (payload) => {
      try {
        const parsed = casinoBuzzPressSchema.parse(payload);
        service.pressBuzzer(playerId, parsed.windowId);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('casino:answer_submit', (payload) => {
      try {
        const parsed = casinoAnswerSubmitSchema.parse(payload);
        service.submitAnswer(playerId, parsed.answer);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('casino:drawing_submit', (payload) => {
      try {
        const parsed = casinoDrawingSubmitSchema.parse(payload);
        service.submitDrawing(playerId, parsed.imageDataUrl);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('casino:vote_cast', (payload) => {
      try {
        const parsed = casinoDrawingVoteSchema.parse(payload);
        service.castDrawingVote(playerId, parsed.targetPlayerId);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('casino:host_action', (payload) => {
      try {
        const parsed = casinoHostActionSchema.parse(payload);
        service.hostAction(playerId, parsed.action, parsed.payload);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('disconnect', () => {
      const result = roomManager.markDisconnected('casino', roomCode, playerId);
      if (result.newHostId) {
        io.of(NAMESPACES.casino).to(roomCode).emit('room:host_transferred', {
          roomCode,
          newHostId: result.newHostId,
        });
      }
      emitCasinoState(roomCode);
    });
  });

  io.of(NAMESPACES.bank).on('connection', (socket) => {
    const auth = socket.data.auth as {
      roomCode: string;
      playerId: string;
      sessionToken: string;
      gameType: GameType;
    };

    const roomCode = auth.roomCode;
    const playerId = auth.playerId;
    const service = bankServices.get(roomCode);
    if (!service) {
      socket.emit('room:error', {
        code: ERROR_CODES.roomNotFound,
        message: 'Room not found',
      });
      socket.disconnect(true);
      return;
    }

    socket.join(roomCode);
    emitBankState(roomCode);

    socket.on('bank:start_game', () => {
      try {
        service.startGame(playerId);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:roll_request', () => {
      try {
        service.rollDice(playerId);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:buy_commit', (payload) => {
      try {
        const parsed = bankBuySchema.parse(payload);
        service.commitBuy(playerId, parsed);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:auction_bid', (payload) => {
      try {
        const parsed = bankAuctionBidSchema.parse(payload);
        service.placeAuctionBid(playerId, parsed.amount);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:auction_end', () => {
      try {
        service.closeAuction(playerId);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:end_turn', () => {
      try {
        service.endTurn(playerId);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:mortgage_toggle', (payload) => {
      try {
        const parsed = bankMortgageSchema.parse(payload);
        service.toggleMortgage(playerId, parsed.tileId, parsed.mortgaged);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:house_action', (payload) => {
      try {
        const parsed = bankHouseActionSchema.parse(payload);
        service.houseAction(playerId, parsed.tileId, parsed.operation);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:trade_propose', (payload) => {
      try {
        const parsed = bankTradeProposalSchema.parse(payload);
        service.proposeTrade(playerId, parsed);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:trade_decide', (payload) => {
      try {
        const parsed = bankTradeDecisionSchema.parse(payload);
        service.decideTrade(playerId, parsed.tradeId, parsed.accept);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('bank:host_action', (payload) => {
      try {
        const parsed = bankHostActionSchema.parse(payload);
        service.hostAction(playerId, parsed.action, parsed.payload);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('disconnect', () => {
      const result = roomManager.markDisconnected('bank', roomCode, playerId);
      if (result.newHostId) {
        io.of(NAMESPACES.bank).to(roomCode).emit('room:host_transferred', {
          roomCode,
          newHostId: result.newHostId,
        });
      }
      emitBankState(roomCode);
    });
  });

  return {
    app,
    httpServer,
    io,
    roomManager,
    close: async () => {
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}