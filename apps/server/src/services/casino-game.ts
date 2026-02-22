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
  private autoNextTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: CasinoGameServiceOptions) { }

  dispose(): void {
    this.clearAnswerTimer();
    this.clearDrawingTimer();
    this.clearAutoNextTimer();
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

    if (round.answerRevealed) {
      return;
    }

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
      this.scheduleAutoNextIfNeeded();
      this.touch();
      return;
    }

    this.updateScore(playerId, -1);
    // Do NOT exclude from buzzing — players can always try again after a wrong answer
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
    if (!drawing || (drawing.phase !== 'drawing' && drawing.phase !== 'ready_up')) {
      return;
    }

    // Simultaneous submission
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

    this.emit('casino:drawing_submitted', {
      roomCode: this.options.roomCode,
      playerId,
      count: drawing.submissions.length,
      total: drawing.drawerOrder.length,
    });

    if (drawing.submissions.length >= drawing.drawerOrder.length) {
      this.clearDrawingTimer();
      drawing.phase = 'voting';
      drawing.currentVoterIndex = 0;
      drawing.drawingDeadlineAt = undefined;
      this.emit('casino:voting_start', {
        roomCode: this.options.roomCode,
        roundNumber: round.roundNumber,
        voterPlayerId: drawing.votingPlayerOrder[drawing.currentVoterIndex],
        submissions: drawing.submissions,
      });
    }
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

  voteRepeat(playerId: string): void {
    const round = this.options.state.currentRound;
    if (!round || round.type !== 'reversed') {
      return;
    }
    // Prevent duplicate votes
    if (!round.repeatVoterIds) {
      round.repeatVoterIds = [];
    }
    if (round.repeatVoterIds.includes(playerId)) {
      return;
    }
    round.repeatVoterIds.push(playerId);
    round.repeatVoteCount = round.repeatVoterIds.length;

    const playersNeeded = Math.ceil(this.playablePlayers().length * 0.5);
    this.emit('casino:vote_repeat', {
      roomCode: this.options.roomCode,
      repeatVoteCount: round.repeatVoteCount,
      neededForRepeat: playersNeeded,
      triggered: round.repeatVoteCount >= playersNeeded,
    });

    this.touch();
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
      // In simultaneous drawing, we don't necessarily need to submit empty for disconnected players
      // unless we want to force end the round. For now, let the timer handle it.
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
        phase: 'ready_up',
        readyPlayerIds: [],
        drawingDeadlineAt: undefined,
      },
    };

    this.options.state.currentRound = round;

    this.emit('casino:round_start', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      type: round.type,
      question: prompt,
    });
    this.touch();
  }

  drawingReady(playerId: string): void {
    const round = this.requireDrawingRound();
    const drawing = round.drawing;
    if (!drawing || drawing.phase !== 'ready_up') {
      return;
    }

    if (!drawing.readyPlayerIds.includes(playerId)) {
      drawing.readyPlayerIds.push(playerId);
    }

    const playable = this.playablePlayers();
    if (drawing.readyPlayerIds.length >= playable.length) {
      drawing.phase = 'drawing';
      drawing.drawingDeadlineAt = now() + DRAWING_SECONDS * 1000;
      this.emit('casino:drawing_start', {
        roomCode: this.options.roomCode,
        roundNumber: round.roundNumber,
        deadlineAt: drawing.drawingDeadlineAt,
      });
      this.scheduleDrawingTimeout();
    }
    this.touch();
  }

  private reopenOrReveal(round: CasinoRoundState): void {
    // Always reopen — answer reveal only happens via host skip or player give-up vote
    round.buzzedPlayerId = undefined;
    round.answerDeadlineAt = undefined;
    round.buzzerWindowId = createId('buzz');

    const eligible = this.getEligibleBuzzers(round);
    this.emit('casino:buzzer_open', {
      roomCode: this.options.roomCode,
      roundNumber: round.roundNumber,
      windowId: round.buzzerWindowId,
      eligiblePlayerIds: eligible,
      excludedPlayerIds: round.excludedPlayerIds,
    });
    this.touch();
  }

  giveUp(playerId: string): void {
    const round = this.options.state.currentRound;
    if (!round || round.type === 'drawing' || round.answerRevealed) {
      return;
    }
    if (!round.giveUpVoterIds) {
      round.giveUpVoterIds = [];
    }
    if (round.giveUpVoterIds.includes(playerId)) {
      return;
    }
    round.giveUpVoterIds.push(playerId);
    round.giveUpCount = round.giveUpVoterIds.length;

    const playersNeeded = Math.ceil(this.playablePlayers().length * 0.5);
    const triggered = round.giveUpCount >= playersNeeded;

    this.emit('casino:give_up_vote', {
      roomCode: this.options.roomCode,
      giveUpCount: round.giveUpCount,
      neededToReveal: playersNeeded,
      triggered,
    });

    if (triggered) {
      this.forceRevealRound();
    } else {
      this.touch();
    }
  }

  private handleBuzzTimeout(): void {
    const round = this.requireTimedRound();
    if (!round.buzzedPlayerId) {
      return;
    }

    const timedOutId = round.buzzedPlayerId;
    this.updateScore(timedOutId, -1);
    // Add to excluded only on timeout (not wrong answer), so they sit out this window
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
    this.scheduleAutoNextIfNeeded();
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
    this.scheduleAutoNextIfNeeded();
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

      // Auto-submit/End drawing phase
      if (round.drawing.phase === 'drawing') {
        round.drawing.phase = 'voting';
        round.drawing.currentVoterIndex = 0;
        round.drawing.drawingDeadlineAt = undefined;
        this.emit('casino:voting_start', {
          roomCode: this.options.roomCode,
          roundNumber: round.roundNumber,
          voterPlayerId: round.drawing.votingPlayerOrder[round.drawing.currentVoterIndex],
          submissions: round.drawing.submissions,
        });
        this.touch();
      }
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

  private clearAutoNextTimer(): void {
    if (this.autoNextTimer) {
      clearTimeout(this.autoNextTimer);
      this.autoNextTimer = undefined;
    }
  }

  private scheduleAutoNextIfNeeded(): void {
    this.clearAutoNextTimer();
    if (this.options.state.hostMode !== 'ai' || this.options.state.meta.status !== 'in_game') {
      return;
    }

    // Auto-advance after 7 seconds (gives time for the 5s UI countdown)
    this.autoNextTimer = setTimeout(() => {
      if (this.options.state.meta.status === 'in_game') {
        this.startNextRound();
      }
    }, 7000);
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
