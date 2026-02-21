import { describe, expect, it } from 'vitest';
import type { CasinoRoomState } from '@ags/shared';
import { CasinoGameService } from '../src/services/casino-game.js';

function createState(): CasinoRoomState {
  const now = Date.now();
  return {
    gameType: 'casino',
    paused: false,
    targetScore: 10,
    roundQueue: ['trivia'],
    usedQuestionIds: { reversed: [], flag: [], trivia: [], drawing: [] },
    players: [
      {
        id: 'h1',
        name: 'Host',
        role: 'player',
        seatIndex: 0,
        isHost: true,
        connected: true,
        language: 'ar',
        score: 0,
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
        score: 0,
        joinedAt: now,
        lastSeenAt: now,
      },
    ],
    meta: {
      code: 'ABCD',
      gameType: 'casino',
      hostId: 'h1',
      status: 'lobby',
      createdAt: now,
      updatedAt: now,
    },
  };
}

describe('casino buzzer', () => {
  it('locks first buzzer press only', () => {
    const state = createState();
    const events: Array<{ event: string; payload: unknown }> = [];

    const service = new CasinoGameService({
      roomCode: 'ABCD',
      state,
      content: {
        reversed: [{ id: 'r1', type: 'reversed', reversed: 'بتك', answer: 'كتب', alt: [] }],
        flags: [{ id: 'f1', type: 'flag', countryCode: 'eg', countryName: 'مصر', answer: 'مصر', alt: [] }],
        trivia: [{ id: 't1', type: 'trivia', question: 'Q?', answer: 'A', alt: [] }],
        drawing: ['بيت'],
      },
      emit: (event, payload) => events.push({ event, payload }),
      removePlayer: () => undefined,
      onStateChange: () => undefined,
    });

    service.startGame('h1');
    const windowId = state.currentRound?.buzzerWindowId;
    expect(windowId).toBeTruthy();

    service.pressBuzzer('h1', windowId as string);
    service.pressBuzzer('p2', windowId as string);

    expect(state.currentRound?.buzzedPlayerId).toBe('h1');
    const lockEvents = events.filter((item) => item.event === 'casino:buzz_lock');
    expect(lockEvents.length).toBe(1);

    service.dispose();
  });
});