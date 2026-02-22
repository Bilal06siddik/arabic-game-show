import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { BankBoardConfig, BankRoomState, BankRulePreset, BankTile } from '@ags/shared';
import { loadEgyptBoard } from '../src/lib/content-loader.js';
import { BankGameService } from '../src/services/bank-game.js';

const rentBoard: BankBoardConfig = {
  id: 'test',
  name: { ar: 'اختبار', en: 'Test' },
  goSalary: 200,
  jailFine: 50,
  houseRules: { freeParkingJackpot: false },
  tiles: [
    { id: 0, kind: 'go', name: { ar: 'انطلاق', en: 'GO' } },
    {
      id: 1,
      kind: 'property',
      name: { ar: 'مدينة', en: 'City' },
      color: 'brown',
      price: 100,
      baseRent: 10,
      rentWithHouse: [40, 120, 360, 640],
      rentWithHotel: 900,
      mortgageValue: 50,
      housePrice: 50,
    },
    { id: 2, kind: 'jail', name: { ar: 'سجن', en: 'Jail' } },
  ],
};

const freeParkingBoard: BankBoardConfig = {
  id: 'free-parking-test',
  name: { ar: 'اختبار الموقف الحر', en: 'Free Parking Test' },
  goSalary: 200,
  jailFine: 50,
  houseRules: { freeParkingJackpot: true },
  tiles: [
    { id: 0, kind: 'go', name: { ar: 'انطلاق', en: 'GO' } },
    { id: 1, kind: 'tax', name: { ar: 'ضريبة', en: 'Tax' }, amount: 200 },
    { id: 2, kind: 'free_parking', name: { ar: 'موقف حر', en: 'Free Parking' } },
  ],
};

const chanceBoard: BankBoardConfig = {
  id: 'chance-test',
  name: { ar: 'اختبار الفرصة', en: 'Chance Test' },
  goSalary: 200,
  jailFine: 50,
  houseRules: { freeParkingJackpot: false },
  tiles: [
    { id: 0, kind: 'go', name: { ar: 'انطلاق', en: 'GO' } },
    { id: 1, kind: 'chance', name: { ar: 'فرصة', en: 'Chance' } },
    { id: 2, kind: 'jail', name: { ar: 'سجن', en: 'Jail' } },
  ],
};

function createState(input?: {
  board?: BankBoardConfig;
  rulePreset?: BankRulePreset;
}): BankRoomState {
  const now = Date.now();
  const board = input?.board ?? rentBoard;
  return {
    gameType: 'bank',
    paused: false,
    rulePreset: input?.rulePreset ?? 'official',
    board,
    players: [
      {
        id: 'p1',
        name: 'P1',
        role: 'player',
        seatIndex: 0,
        isHost: true,
        connected: true,
        language: 'ar',
        joinedAt: now,
        lastSeenAt: now,
      },
      {
        id: 'p2',
        name: 'P2',
        role: 'player',
        seatIndex: 1,
        isHost: false,
        connected: true,
        language: 'ar',
        joinedAt: now,
        lastSeenAt: now,
      },
    ],
    bankPlayers: [
      {
        playerId: 'p1',
        cash: 1500,
        position: 0,
        inJail: false,
        jailTurns: 0,
        doublesInRow: 0,
        bankrupt: false,
        assets: board.id === rentBoard.id ? [{ tileId: 1, houses: 0, hotel: false, mortgaged: false }] : [],
      },
      {
        playerId: 'p2',
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
      code: 'BANK1',
      gameType: 'bank',
      hostId: 'p1',
      status: 'in_game',
      createdAt: now,
      updatedAt: now,
    },
    turn: {
      currentPlayerId: 'p2',
      turnNumber: 1,
      timerEnabled: false,
      hasRolled: true,
    },
    pendingAction: { type: 'roll' },
  };
}

function boardEconomyHash(board: BankBoardConfig): string {
  const economy = {
    goSalary: board.goSalary,
    jailFine: board.jailFine,
    tiles: board.tiles.map((tile) => extractTileEconomy(tile)),
  };

  return createHash('sha256').update(JSON.stringify(economy)).digest('hex');
}

function extractTileEconomy(tile: BankTile): Record<string, unknown> {
  if (tile.kind === 'property') {
    return {
      id: tile.id,
      kind: tile.kind,
      color: tile.color,
      price: tile.price,
      baseRent: tile.baseRent,
      rentWithHouse: tile.rentWithHouse,
      rentWithHotel: tile.rentWithHotel,
      mortgageValue: tile.mortgageValue,
      housePrice: tile.housePrice,
    };
  }

  if (tile.kind === 'railroad') {
    return {
      id: tile.id,
      kind: tile.kind,
      price: tile.price,
      mortgageValue: tile.mortgageValue,
      rentByCount: tile.rentByCount,
    };
  }

  if (tile.kind === 'utility') {
    return {
      id: tile.id,
      kind: tile.kind,
      price: tile.price,
      mortgageValue: tile.mortgageValue,
      rentMultiplierOne: tile.rentMultiplierOne,
      rentMultiplierTwo: tile.rentMultiplierTwo,
    };
  }

  if (tile.kind === 'tax') {
    return {
      id: tile.id,
      kind: tile.kind,
      amount: tile.amount,
    };
  }

  return {
    id: tile.id,
    kind: tile.kind,
  };
}

describe('bank game rent', () => {
  it('charges rent to visitor and credits owner', () => {
    const state = createState();
    const service = new BankGameService({
      roomCode: 'BANK1',
      state,
      emit: () => undefined,
      removePlayer: () => undefined,
      onStateChange: () => undefined,
    });

    (service as any).movePlayer('p2', 1);

    const p1 = state.bankPlayers.find((p) => p.playerId === 'p1');
    const p2 = state.bankPlayers.find((p) => p.playerId === 'p2');
    expect(p1?.cash).toBe(1520);
    expect(p2?.cash).toBe(1480);
  });

  it('does not accumulate or grant free parking jackpot in official preset', () => {
    const state = createState({ board: freeParkingBoard, rulePreset: 'official' });
    const service = new BankGameService({
      roomCode: 'BANK1',
      state,
      emit: () => undefined,
      removePlayer: () => undefined,
      onStateChange: () => undefined,
    });

    (service as any).movePlayer('p2', 1);
    expect(state.freeParkingPot).toBe(0);

    (service as any).movePlayer('p2', 1);

    const p2 = state.bankPlayers.find((p) => p.playerId === 'p2');
    expect(p2?.cash).toBe(1300);
    expect(state.freeParkingPot).toBe(0);
  });

  it('accumulates and grants free parking jackpot in house preset', () => {
    const state = createState({ board: freeParkingBoard, rulePreset: 'house' });
    const service = new BankGameService({
      roomCode: 'BANK1',
      state,
      emit: () => undefined,
      removePlayer: () => undefined,
      onStateChange: () => undefined,
    });

    (service as any).movePlayer('p2', 1);
    expect(state.freeParkingPot).toBe(200);

    (service as any).movePlayer('p2', 1);

    const p2 = state.bankPlayers.find((p) => p.playerId === 'p2');
    expect(p2?.cash).toBe(1500);
    expect(state.freeParkingPot).toBe(0);
  });

  it('keeps the default Egypt board economy locked', () => {
    const board = loadEgyptBoard();
    const hash = boardEconomyHash(board);
    expect(hash).toBe('7a5b86357247d095f02863b5bfa6651368b74c6a6e05b39fb259a6d90eb3f2ad');
  });

  it('does not keep pending action stuck on roll after landing on chance', () => {
    const state = createState({ board: chanceBoard, rulePreset: 'official' });
    state.pendingAction = { type: 'roll' };
    const service = new BankGameService({
      roomCode: 'BANK1',
      state,
      emit: () => undefined,
      removePlayer: () => undefined,
      onStateChange: () => undefined,
    });

    const player = state.bankPlayers.find((entry) => entry.playerId === 'p2');
    if (!player) {
      throw new Error('Test setup failed');
    }
    player.position = 1;

    (service as any).handleLand('p2');

    expect(state.pendingAction?.type).not.toBe('roll');
  });
});
