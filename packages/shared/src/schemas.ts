import { z } from 'zod';

export const languageSchema = z.enum(['ar', 'en']);
export const roleSchema = z.enum(['host', 'player']);
export const hostActionSchema = z.enum([
  'pause',
  'resume',
  'skip',
  'kick',
  'score_adjust',
]);

export const createCasinoRoomSchema = z.object({
  hostName: z.string().trim().min(1).max(24),
  language: languageSchema.default('ar'),
  hostMode: z.enum(['player', 'moderator', 'ai']).default('player'),
  targetScore: z.number().int().min(5).max(50).default(10),
});

export const createBankRoomSchema = z.object({
  hostName: z.string().trim().min(1).max(24),
  language: languageSchema.default('ar'),
  hostMode: z.enum(['player', 'moderator', 'ai']).default('player'),
  rulePreset: z.enum(['official', 'house']).default('official'),
});

export const joinRoomSchema = z.object({
  name: z.string().trim().min(1).max(24),
  language: languageSchema.default('ar'),
});

export const reconnectSchema = z.object({
  sessionToken: z.string().min(8).max(256),
});

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/);

export const socketAuthSchema = z.object({
  roomCode: roomCodeSchema,
  playerId: z.string().min(3),
  sessionToken: z.string().min(8),
  gameType: z.enum(['casino', 'bank']),
});

export const casinoBuzzPressSchema = z.object({
  windowId: z.string().min(8),
  sentAt: z.number().int().optional(),
});

export const casinoAnswerSubmitSchema = z.object({
  answer: z.string().max(120),
});

export const casinoDrawingSubmitSchema = z.object({
  imageDataUrl: z.string().min(32).max(2_000_000),
});

export const casinoDrawingVoteSchema = z.object({
  targetPlayerId: z.string().min(3),
});

export const casinoHostActionSchema = z.object({
  action: hostActionSchema,
  payload: z
    .object({
      playerId: z.string().optional(),
      scoreDelta: z.number().int().min(-20).max(20).optional(),
    })
    .optional(),
});

export const bankHostActionSchema = z.object({
  action: z.enum(['pause', 'resume', 'skip', 'kick', 'score_adjust', 'toggle_timer']),
  payload: z
    .object({
      playerId: z.string().optional(),
      timerEnabled: z.boolean().optional(),
      cashDelta: z.number().int().min(-5000).max(5000).optional(),
    })
    .optional(),
});

export const bankRollSchema = z.object({});

export const bankBuySchema = z.object({
  tileId: z.number().int().min(0).max(100),
  accept: z.boolean().default(true),
});

export const bankAuctionBidSchema = z.object({
  amount: z.number().int().positive(),
});

export const bankMortgageSchema = z.object({
  tileId: z.number().int().min(0).max(100),
  mortgaged: z.boolean(),
});

export const bankHouseActionSchema = z.object({
  tileId: z.number().int().min(0).max(100),
  operation: z.enum(['buy', 'sell']),
});

export const bankTradeProposalSchema = z.object({
  toPlayerId: z.string().min(3),
  cashFrom: z.number().int().min(0).max(10_000).optional(),
  cashTo: z.number().int().min(0).max(10_000).optional(),
  assetsFrom: z.array(z.number().int().min(0).max(100)).default([]),
  assetsTo: z.array(z.number().int().min(0).max(100)).default([]),
});

export const bankTradeDecisionSchema = z.object({
  tradeId: z.string().min(8),
  accept: z.boolean(),
});

export type CreateCasinoRoomInput = z.infer<typeof createCasinoRoomSchema>;
export type CreateBankRoomInput = z.infer<typeof createBankRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type ReconnectInput = z.infer<typeof reconnectSchema>;
