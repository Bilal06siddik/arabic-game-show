import { describe, expect, it } from 'vitest';
import { RoomManager } from '../src/room-manager.js';

const board = {
  id: 'test',
  name: { ar: 'لوحة', en: 'Board' },
  goSalary: 200,
  jailFine: 50,
  houseRules: { freeParkingJackpot: false },
  tiles: [
    { id: 0, kind: 'go', name: { ar: 'انطلاق', en: 'GO' } },
    { id: 1, kind: 'property', name: { ar: 'A', en: 'A' }, color: 'brown', price: 60, baseRent: 2, rentWithHouse: [10, 30, 90, 160], rentWithHotel: 250, mortgageValue: 30, housePrice: 50 },
    { id: 2, kind: 'jail', name: { ar: 'سجن', en: 'Jail' } },
  ],
} as const;

describe('room-manager', () => {
  it('creates, joins and reconnects', () => {
    const manager = new RoomManager();
    const created = manager.createCasinoRoom({
      hostName: 'Host',
      language: 'ar',
      hostCanPlay: true,
      targetScore: 10,
    });

    const joined = manager.joinRoom(created.roomCode, {
      name: 'P2',
      language: 'en',
    });

    expect(joined.roomCode).toBe(created.roomCode);

    const reconnected = manager.reconnect(created.roomCode, joined.sessionToken);
    expect(reconnected.playerId).toBe(joined.playerId);
    expect(reconnected.sessionToken).not.toBe(joined.sessionToken);
  });

  it('auto transfers host on disconnect', () => {
    const manager = new RoomManager();
    const created = manager.createBankRoom(
      {
        hostName: 'Host',
        language: 'ar',
        hostCanPlay: true,
        rulePreset: 'official',
        pieceColor: 'orange',
      },
      board,
    );

    const joined = manager.joinRoom(created.roomCode, {
      name: 'P2',
      language: 'ar',
      pieceColor: 'teal',
    });

    const result = manager.markDisconnected('bank', created.roomCode, created.playerId);
    expect(result.newHostId).toBe(joined.playerId);
    const bankRoom = manager.getBankRoom(created.roomCode);
    expect(bankRoom?.state.players.find((player) => player.id === created.playerId)?.pieceColor).toBe('orange');
    expect(bankRoom?.state.players.find((player) => player.id === joined.playerId)?.pieceColor).toBe('teal');
  });

  it('rejects joining with an already used piece color', () => {
    const manager = new RoomManager();
    const created = manager.createBankRoom(
      {
        hostName: 'Host',
        language: 'ar',
        hostCanPlay: true,
        rulePreset: 'official',
        pieceColor: 'orange',
      },
      board,
    );

    expect(() =>
      manager.joinRoom(created.roomCode, {
        name: 'P2',
        language: 'ar',
        pieceColor: 'orange',
      }),
    ).toThrow('PIECE_COLOR_TAKEN');
  });
});
