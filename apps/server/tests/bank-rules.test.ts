import { describe, expect, it } from 'vitest';
import type { BankBoardConfig, BankRoomState } from '@ags/shared';
import { BankGameService } from '../src/services/bank-game.js';

const board: BankBoardConfig = {
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

function createState(): BankRoomState {
  const now = Date.now();
  return {
    gameType: 'bank',
    paused: false,
    rulePreset: 'official',
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
        assets: [{ tileId: 1, houses: 0, hotel: false, mortgaged: false }],
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
});
