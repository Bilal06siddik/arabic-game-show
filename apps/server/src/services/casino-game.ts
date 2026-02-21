import {
  ANSWER_SECONDS,
  DRAWING_SECONDS,
  type CasinoQuestionItem,
  type CasinoRoomState,
  type CasinoRoundState,
  type CasinoRoundType,
  type DrawingPrompt,
  type FlagQuestion,
  type HostAction,
  type ReversedQuestion,
  type TriviaQuestion,
} from '@ags/shared';
import { matchesAnswer } from '../lib/answer-utils.js';
import { createId, now, pickOne, shuffle } from '../lib/utils.js';

interface CasinoContent {
  reversed: ReversedQuestion[];
  flags: FlagQuestion[];
  trivia: TriviaQuestion[];
  drawing: string[];
}

interface CasinoGameServiceOptions {
  roomCode: string;
  state: CasinoRoomState;
  content: CasinoContent;
  emit: (event: string, payload: unknown) => void;
  removePlayer: (playerId: string) => void;
  onStateChange: () => void;
}

interface HostActionPayload {
  playerId?: string;
  scoreDelta?: number;
}

export class CasinoGameService {
  private answerTimer: NodeJS.Timeout | undefined;
  private drawingTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: CasinoGameServiceOptions) {}

  dispose(): void {
    this.clearAnswerTimer();
    this.clearDrawingTimer();
  }

  startGame(actorId: string): void {
    this.assertHost(actorId);
    const playableCount = this.playablePlayers().length;
    if (playableCount === 0) {
      throw new Error('INVALID_ACTION');
    }

    this.options.state.meta.status = 'in_game';
    this.options.state.startedAt = now();
    this.options.state.winnerId = undefined;
    this.startNextRound();
  }

  nextRound(actorId: string): void {
    this.assertHost(actorId);
    if (this.options.state.meta.status !== 'in_game') {
      throw new Error('INVALID_ACTION');
    }
    this.startNextRound();
  }

  pressBuzzer(playerId: string, windowId: string): void {
    const round = this.requireTimedRound();
    if (round.buzzerWindowId !== windowId || round.buzzedPlayerId) {
      return;
    }

    const eligible = this.getEligibleBuzzers(round);
    if (!eligible.includes(playerId)) {
      return;
    }

    round.buzzedPlayerId = playerId;
    round.answerDeadlineAt = now() + ANSWER_SECONDS * 1000;
    this.scheduleAnswerTimeout();

    this.emit('casino:buzz_lock', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      winnerPlayerId: playerId,
      answerDeadlineAt: round.answerDeadlineAt,
    });
    this.touch();
  }

  submitAnswer(playerId: string, answer: string): void {
    const round = this.requireTimedRound();
    if (round.buzzedPlayerId !== playerId) {
      return;
    }

    this.clearAnswerTimer();
    round.answerDeadlineAt = undefined;

    const question = round.question as ReversedQuestion | FlagQuestion | TriviaQuestion;
    const correct = matchesAnswer(answer, question.answer, question.alt ?? []);

    if (correct) {
      this.updateScore(playerId, 1);
      round.answerRevealed = true;
      round.revealedAnswer = question.answer;
      this.emit('casino:answer_result', {
        roomCode: this.options.roomCode,
        playerId,
        correct: true,
        answer,
        revealedAnswer: question.answer,
      });
      this.emit('casino:round_end', {
        roomCode: this.options.roomCode,
        roundNumber: round.roundNumber,
        type: round.type,
      });
      this.checkWinner();
      this.touch();
      return;
    }

    this.updateScore(playerId, -1);
    round.excludedPlayerIds.push(playerId);
    round.buzzedPlayerId = undefined;

    this.emit('casino:answer_result', {
      roomCode: this.options.roomCode,
      playerId,
      correct: false,
      answer,
    });

    this.reopenOrReveal(round);
  }

  submitDrawing(playerId: string, imageDataUrl: string): void {
    const round = this.requireDrawingRound();
    const drawing = round.drawing;
    if (!drawing || drawing.phase !== 'drawing') {
      return;
    }

    const currentDrawer = drawing.drawerOrder[drawing.currentDrawerIndex];
    if (currentDrawer !== playerId) {
      return;
    }

    this.clearDrawingTimer();

    const existing = drawing.submissions.find((item) => item.playerId === playerId);
    if (existing) {
      existing.imageDataUrl = imageDataUrl;
      existing.submittedAt = now();
    } else {
      drawing.submissions.push({
        playerId,
        imageDataUrl,
        submittedAt: now(),
      });
    }

    drawing.currentDrawerIndex += 1;
    if (drawing.currentDrawerIndex < drawing.drawerOrder.length) {
      const nextDrawerId = drawing.drawerOrder[drawing.currentDrawerIndex];
      drawing.drawingDeadlineAt = now() + DRAWING_SECONDS * 1000;
      this.emit('casino:drawing_turn', {
        roomCode: this.options.roomCode,
        roundNumber: round.roundNumber,
        drawerPlayerId: nextDrawerId,
        deadlineAt: drawing.drawingDeadlineAt,
      });
      this.scheduleDrawingTimeout();
      this.touch();
      return;
    }

    drawing.phase = 'voting';
    drawing.currentVoterIndex = 0;
    drawing.drawingDeadlineAt = undefined;
    this.emit('casino:voting_start', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      voterPlayerId: drawing.votingPlayerOrder[drawing.currentVoterIndex],
      submissions: drawing.submissions,
    });
    this.touch();
  }

  castDrawingVote(playerId: string, targetPlayerId: string): void {
    const round = this.requireDrawingRound();
    const drawing = round.drawing;
    if (!drawing || drawing.phase !== 'voting') {
      return;
    }

    const currentVoterId = drawing.votingPlayerOrder[drawing.currentVoterIndex];
    if (currentVoterId !== playerId || playerId === targetPlayerId) {
      return;
    }

    if (!drawing.drawerOrder.includes(targetPlayerId)) {
      return;
    }

    const alreadyVoted = drawing.votes.some((vote) => vote.voterId === playerId);
    if (alreadyVoted) {
      return;
    }

    drawing.votes.push({
      voterId: playerId,
      targetPlayerId,
      votedAt: now(),
    });

    drawing.currentVoterIndex += 1;
    if (drawing.currentVoterIndex < drawing.votingPlayerOrder.length) {
      this.emit('casino:voting_progress', {
        roomCode: this.options.roomCode,
        roundNumber: round.roundNumber,
        nextVoterPlayerId: drawing.votingPlayerOrder[drawing.currentVoterIndex],
      });
      this.touch();
      return;
    }

    drawing.phase = 'done';
    this.finishDrawingRound(round);
  }

  hostAction(actorId: string, action: HostAction, payload?: HostActionPayload): void {
    this.assertHost(actorId);

    if (action === 'pause') {
      this.options.state.paused = true;
    } else if (action === 'resume') {
      this.options.state.paused = false;
    } else if (action === 'skip') {
      if (this.options.state.currentRound?.type === 'drawing') {
        this.forceCompleteDrawing();
      } else {
        this.forceRevealRound();
      }
    } else if (action === 'kick' && payload?.playerId) {
      this.options.removePlayer(payload.playerId);
    } else if (action === 'score_adjust' && payload?.playerId && typeof payload.scoreDelta === 'number') {
      this.updateScore(payload.playerId, payload.scoreDelta);
      this.checkWinner();
    }

    this.emit('casino:host_action', {
      roomCode: this.options.roomCode,
      actorId,
      action,
      payload,
    });
    this.touch();
  }

  onPlayerDisconnected(playerId: string): void {
    const round = this.options.state.currentRound;
    if (!round) {
      return;
    }

    if (round.type !== 'drawing' && round.buzzedPlayerId === playerId) {
      this.handleBuzzTimeout();
      return;
    }

    if (round.type === 'drawing') {
      const drawing = round.drawing;
      if (!drawing || drawing.phase !== 'drawing') {
        return;
      }
      const currentDrawer = drawing.drawerOrder[drawing.currentDrawerIndex];
      if (currentDrawer === playerId) {
        this.submitDrawing(playerId, '');
      }
    }
  }

  onPlayerRemoved(playerId: string): void {
    const round = this.options.state.currentRound;
    if (!round) {
      return;
    }

    if (round.type === 'drawing' && round.drawing) {
      round.drawing.drawerOrder = round.drawing.drawerOrder.filter((id) => id !== playerId);
      round.drawing.votingPlayerOrder = round.drawing.votingPlayerOrder.filter((id) => id !== playerId);
      round.drawing.submissions = round.drawing.submissions.filter((entry) => entry.playerId !== playerId);
      round.drawing.votes = round.drawing.votes.filter(
        (vote) => vote.voterId !== playerId && vote.targetPlayerId !== playerId,
      );
    }

    if (round.buzzedPlayerId === playerId) {
      this.clearAnswerTimer();
      round.buzzedPlayerId = undefined;
      round.answerDeadlineAt = undefined;
      this.reopenOrReveal(round);
      return;
    }

    round.excludedPlayerIds = round.excludedPlayerIds.filter((id) => id !== playerId);
    this.touch();
  }

  onHostTransferred(_newHostId?: string): void {
    this.touch();
  }

  private startNextRound(): void {
    this.clearAnswerTimer();
    this.clearDrawingTimer();

    const nextRoundNumber = (this.options.state.currentRound?.roundNumber ?? 0) + 1;
    const type = this.nextRoundType();
    if (type === 'drawing') {
      this.startDrawingRound(nextRoundNumber);
      return;
    }

    const question = this.pickQuestion(type);
    const round: CasinoRoundState = {
      roundNumber: nextRoundNumber,
      type,
      startedAt: now(),
      question,
      answerRevealed: false,
      excludedPlayerIds: [],
      buzzerWindowId: createId('buzz'),
    };

    this.options.state.currentRound = round;
    this.emit('casino:round_start', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      type: round.type,
      question,
    });

    this.emit('casino:buzzer_open', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      windowId: round.buzzerWindowId,
      eligiblePlayerIds: this.getEligibleBuzzers(round),
    });
    this.touch();
  }

  private startDrawingRound(nextRoundNumber: number): void {
    const word = this.pickDrawingWord();
    const players = this.playablePlayers().map((player) => player.id);
    const prompt: DrawingPrompt = {
      type: 'drawing',
      id: createId('draw'),
      word,
    };

    const round: CasinoRoundState = {
      roundNumber: nextRoundNumber,
      type: 'drawing',
      startedAt: now(),
      question: prompt,
      answerRevealed: false,
      excludedPlayerIds: [],
      drawing: {
        currentDrawerIndex: 0,
        drawerOrder: players,
        submissions: [],
        votingPlayerOrder: players,
        currentVoterIndex: 0,
        votes: [],
        phase: 'drawing',
        drawingDeadlineAt: now() + DRAWING_SECONDS * 1000,
      },
    };

    this.options.state.currentRound = round;

    this.emit('casino:round_start', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      type: round.type,
      question: prompt,
    });
    this.emit('casino:drawing_turn', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      drawerPlayerId: players[0],
      deadlineAt: round.drawing?.drawingDeadlineAt,
    });
    this.scheduleDrawingTimeout();
    this.touch();
  }

  private reopenOrReveal(round: CasinoRoundState): void {
    const eligible = this.getEligibleBuzzers(round);
    if (eligible.length === 0) {
      this.forceRevealRound();
      return;
    }

    round.buzzedPlayerId = undefined;
    round.answerDeadlineAt = undefined;
    round.buzzerWindowId = createId('buzz');

    this.emit('casino:buzzer_open', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      windowId: round.buzzerWindowId,
      eligiblePlayerIds: eligible,
      excludedPlayerIds: round.excludedPlayerIds,
    });
    this.touch();
  }

  private handleBuzzTimeout(): void {
    const round = this.requireTimedRound();
    if (!round.buzzedPlayerId) {
      return;
    }

    const timedOutId = round.buzzedPlayerId;
    this.updateScore(timedOutId, -1);
    round.excludedPlayerIds.push(timedOutId);
    round.buzzedPlayerId = undefined;
    round.answerDeadlineAt = undefined;

    this.emit('casino:answer_result', {
      roomCode: this.options.roomCode,
      playerId: timedOutId,
      correct: false,
      timeout: true,
    });

    this.reopenOrReveal(round);
  }

  private forceRevealRound(): void {
    const round = this.options.state.currentRound;
    if (!round || round.type === 'drawing') {
      return;
    }

    const question = round.question as ReversedQuestion | FlagQuestion | TriviaQuestion;
    round.answerRevealed = true;
    round.revealedAnswer = question.answer;
    round.buzzedPlayerId = undefined;
    round.answerDeadlineAt = undefined;
    this.clearAnswerTimer();

    this.emit('casino:round_end', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      type: round.type,
      revealedAnswer: question.answer,
    });
    this.touch();
  }

  private forceCompleteDrawing(): void {
    const round = this.options.state.currentRound;
    if (!round || round.type !== 'drawing' || !round.drawing) {
      return;
    }
    const drawing = round.drawing;
    drawing.phase = 'done';
    this.clearDrawingTimer();
    this.finishDrawingRound(round);
  }

  private finishDrawingRound(round: CasinoRoundState): void {
    const drawing = round.drawing;
    if (!drawing) {
      return;
    }

    const tally = new Map<string, number>();
    drawing.votes.forEach((vote) => {
      tally.set(vote.targetPlayerId, (tally.get(vote.targetPlayerId) ?? 0) + 1);
    });

    const maxVotes = Math.max(0, ...tally.values());
    const winners = maxVotes
      ? [...tally.entries()].filter(([, value]) => value === maxVotes).map(([playerId]) => playerId)
      : [];

    winners.forEach((playerId) => this.updateScore(playerId, 1));

    round.answerRevealed = true;
    round.revealedAnswer = winners.length ? winners.join(',') : '';

    this.emit('casino:round_end', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      type: round.type,
      winners,
      votes: drawing.votes,
      maxVotes,
    });

    this.checkWinner();
    this.touch();
  }

  private checkWinner(): void {
    const winner = this.playablePlayers().find(
      (player) => (player.score ?? 0) >= this.options.state.targetScore,
    );
    if (!winner) {
      return;
    }

    this.options.state.meta.status = 'finished';
    this.options.state.winnerId = winner.id;
    this.options.state.endedAt = now();
    this.emit('casino:game_end', {
      roomCode: this.options.roomCode,
      winnerPlayerId: winner.id,
      score: winner.score ?? 0,
    });
  }

  private updateScore(playerId: string, delta: number): void {
    const player = this.options.state.players.find((entry) => entry.id === playerId);
    if (!player) {
      return;
    }
    player.score = (player.score ?? 0) + delta;
    this.emit('casino:score_update', {
      roomCode: this.options.roomCode,
      playerId,
      score: player.score,
      delta,
    });
  }

  private nextRoundType(): CasinoRoundType {
    if (this.options.state.roundQueue.length === 0) {
      this.options.state.roundQueue = shuffle<CasinoRoundType>([
        'reversed',
        'flag',
        'trivia',
        'drawing',
      ]);
    }
    const type = this.options.state.roundQueue.shift();
    if (!type) {
      return 'trivia';
    }
    return type;
  }

  private pickQuestion(type: Exclude<CasinoRoundType, 'drawing'>): CasinoQuestionItem {
    const used = this.options.state.usedQuestionIds[type];
    const source =
      type === 'reversed'
        ? this.options.content.reversed
        : type === 'flag'
          ? this.options.content.flags
          : this.options.content.trivia;

    const available = source.filter((item) => !used.includes(item.id));
    if (available.length === 0) {
      used.splice(0, used.length);
    }

    const refreshed = source.filter((item) => !used.includes(item.id));
    const picked = pickOne(refreshed);
    used.push(picked.id);
    return picked;
  }

  private pickDrawingWord(): string {
    const used = this.options.state.usedQuestionIds.drawing;
    const words = this.options.content.drawing;
    const available = words.filter((word) => !used.includes(word));
    if (available.length === 0) {
      used.splice(0, used.length);
    }
    const refreshed = words.filter((word) => !used.includes(word));
    const picked = pickOne(refreshed);
    used.push(picked);
    return picked;
  }

  private scheduleAnswerTimeout(): void {
    this.clearAnswerTimer();
    this.answerTimer = setTimeout(() => {
      this.handleBuzzTimeout();
    }, ANSWER_SECONDS * 1000);
  }

  private scheduleDrawingTimeout(): void {
    this.clearDrawingTimer();
    this.drawingTimer = setTimeout(() => {
      const round = this.options.state.currentRound;
      if (!round || round.type !== 'drawing' || !round.drawing) {
        return;
      }
      const currentDrawer = round.drawing.drawerOrder[round.drawing.currentDrawerIndex];
      if (!currentDrawer) {
        return;
      }
      this.submitDrawing(currentDrawer, '');
    }, DRAWING_SECONDS * 1000);
  }

  private clearAnswerTimer(): void {
    if (this.answerTimer) {
      clearTimeout(this.answerTimer);
      this.answerTimer = undefined;
    }
  }

  private clearDrawingTimer(): void {
    if (this.drawingTimer) {
      clearTimeout(this.drawingTimer);
      this.drawingTimer = undefined;
    }
  }

  private getEligibleBuzzers(round: CasinoRoundState): string[] {
    return this.playablePlayers()
      .filter((player) => player.connected)
      .map((player) => player.id)
      .filter((playerId) => !round.excludedPlayerIds.includes(playerId));
  }

  private playablePlayers() {
    return this.options.state.players.filter((player) => player.role === 'player');
  }

  private assertHost(actorId: string): void {
    if (this.options.state.meta.hostId !== actorId) {
      throw new Error('FORBIDDEN');
    }
  }

  private requireTimedRound(): CasinoRoundState {
    const round = this.options.state.currentRound;
    if (!round || round.type === 'drawing') {
      throw new Error('INVALID_ACTION');
    }
    return round;
  }

  private requireDrawingRound(): CasinoRoundState {
    const round = this.options.state.currentRound;
    if (!round || round.type !== 'drawing') {
      throw new Error('INVALID_ACTION');
    }
    return round;
  }

  private emit(event: string, payload: unknown): void {
    this.options.emit(event, payload);
  }

  private touch(): void {
    this.options.state.meta.updatedAt = now();
    this.options.onStateChange();
  }
}
