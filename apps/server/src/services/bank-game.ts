import {
  TURN_SECONDS_DEFAULT,
  type BankAsset,
  type BankBoardConfig,
  type BankPlayerState,
  type BankPropertyTile,
  type BankRailroadTile,
  type BankRoomState,
  type BankRulePreset,
  type BankTile,
  type BankTradeOffer,
  type BankUtilityTile,
  type HostAction,
} from '@ags/shared';
import { createId, now, pickOne } from '../lib/utils.js';

interface BankGameServiceOptions {
  roomCode: string;
  state: BankRoomState;
  emit: (event: string, payload: unknown) => void;
  removePlayer: (playerId: string) => void;
  onStateChange: () => void;
}

interface RollResult {
  d1: number;
  d2: number;
  total: number;
  isDouble: boolean;
}

interface HostActionPayload {
  playerId?: string;
  timerEnabled?: boolean;
  cashDelta?: number;
}

interface BuyPayload {
  tileId: number;
  accept: boolean;
}

interface TradePayload {
  toPlayerId: string;
  cashFrom?: number;
  cashTo?: number;
  assetsFrom: number[];
  assetsTo: number[];
}

const CHANCE_ACTIONS = [
  { type: 'gain', amount: 100, label: 'Unexpected bonus +100' },
  { type: 'pay', amount: 50, label: 'Repair costs -50' },
  { type: 'move', position: 0, label: 'Advance to GO' },
  { type: 'jail', label: 'Go directly to jail' },
] as const;

const CHEST_ACTIONS = [
  { type: 'gain', amount: 50, label: 'Gift +50' },
  { type: 'pay', amount: 30, label: 'Small fee -30' },
  { type: 'gain', amount: 150, label: 'Prize +150' },
  { type: 'pay', amount: 100, label: 'Hospital bill -100' },
] as const;

export class BankGameService {
  private turnTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: BankGameServiceOptions) {}

  dispose(): void {
    this.clearTurnTimer();
  }

  startGame(actorId: string): void {
    this.assertHost(actorId);
    if (this.options.state.meta.status === 'in_game') {
      return;
    }

    const players = this.activePlayersInOrder();
    if (players.length < 2) {
      throw new Error('INVALID_ACTION');
    }

    this.options.state.meta.status = 'in_game';
    this.options.state.startedAt = now();
    this.options.state.turn = {
      currentPlayerId: players[0].playerId,
      turnNumber: 1,
      timerEnabled: false,
      hasRolled: false,
    };
    this.options.state.pendingAction = { type: 'roll' };

    this.emit('bank:game_start', {
      roomCode: this.options.roomCode,
      currentPlayerId: players[0].playerId,
    });
    this.startTurnClock();
    this.touch();
  }

  rollDice(playerId: string): void {
    const turn = this.requireTurn();
    if (turn.currentPlayerId !== playerId || turn.hasRolled) {
      return;
    }

    const bankPlayer = this.requireBankPlayer(playerId);
    if (bankPlayer.bankrupt) {
      return;
    }

    let result: RollResult;
    if (bankPlayer.inJail) {
      result = this.roll();
      if (result.isDouble) {
        bankPlayer.inJail = false;
        bankPlayer.jailTurns = 0;
      } else {
        bankPlayer.jailTurns += 1;
        if (bankPlayer.jailTurns >= 3) {
          bankPlayer.inJail = false;
          bankPlayer.jailTurns = 0;
          this.pay(playerId, undefined, this.options.state.board.jailFine, 'JAIL_FINE');
        } else {
          turn.hasRolled = true;
          this.options.state.pendingAction = { type: 'end_turn' };
          this.emit('bank:dice_result', {
            roomCode: this.options.roomCode,
            playerId,
            ...result,
            stayedInJail: true,
          });
          this.touch();
          return;
        }
      }
    } else {
      result = this.roll();
    }

    turn.hasRolled = true;
    this.options.state.lastDice = [result.d1, result.d2];

    if (result.isDouble) {
      bankPlayer.doublesInRow += 1;
    } else {
      bankPlayer.doublesInRow = 0;
    }

    if (bankPlayer.doublesInRow >= 3) {
      bankPlayer.doublesInRow = 0;
      this.sendToJail(bankPlayer.playerId, 'THREE_DOUBLES');
      this.options.state.pendingAction = { type: 'end_turn' };
      this.emit('bank:dice_result', {
        roomCode: this.options.roomCode,
        playerId,
        ...result,
        threeDoubles: true,
      });
      this.touch();
      return;
    }

    this.movePlayer(playerId, result.total);

    this.emit('bank:dice_result', {
      roomCode: this.options.roomCode,
      playerId,
      ...result,
    });
    this.touch();
  }

  commitBuy(playerId: string, payload: BuyPayload): void {
    const turn = this.requireTurn();
    if (turn.currentPlayerId !== playerId) {
      return;
    }

    if (this.options.state.pendingAction?.type !== 'buy_or_auction') {
      return;
    }

    const tileId = this.options.state.pendingAction.tileId;
    if (tileId === undefined || tileId !== payload.tileId) {
      return;
    }

    if (payload.accept) {
      const tile = this.getTile(tileId);
      if (
        !tile ||
        (tile.kind !== 'property' && tile.kind !== 'railroad' && tile.kind !== 'utility')
      ) {
        return;
      }
      const owner = this.ownerOf(tileId);
      if (owner) {
        return;
      }

      const price = tile.price;
      this.pay(playerId, undefined, price, 'PROPERTY_BUY');
      this.addAsset(playerId, tileId);
      this.emit('bank:buy_commit', {
        roomCode: this.options.roomCode,
        playerId,
        tileId,
        price,
      });
      this.options.state.pendingAction = { type: 'end_turn' };
      this.touch();
      return;
    }

    this.startAuction(tileId);
  }

  placeAuctionBid(playerId: string, amount: number): void {
    const auction = this.options.state.auction;
    if (!auction || auction.closed) {
      return;
    }

    if (!auction.eligibleBidderIds.includes(playerId)) {
      return;
    }

    if (amount <= auction.activeBid) {
      return;
    }

    const player = this.requireBankPlayer(playerId);
    if (player.cash < amount || player.bankrupt) {
      return;
    }

    auction.activeBid = amount;
    auction.activeBidderId = playerId;
    this.emit('bank:auction_bid', {
      roomCode: this.options.roomCode,
      playerId,
      amount,
      tileId: auction.tileId,
    });
    this.touch();
  }

  closeAuction(actorId: string): void {
    const turn = this.requireTurn();
    if (actorId !== turn.currentPlayerId && actorId !== this.options.state.meta.hostId) {
      return;
    }

    const auction = this.options.state.auction;
    if (!auction || auction.closed) {
      return;
    }

    auction.closed = true;
    if (auction.activeBidderId) {
      this.pay(auction.activeBidderId, undefined, auction.activeBid, 'AUCTION_WIN');
      this.addAsset(auction.activeBidderId, auction.tileId);
    }

    this.emit('bank:auction_end', {
      roomCode: this.options.roomCode,
      tileId: auction.tileId,
      winnerPlayerId: auction.activeBidderId,
      amount: auction.activeBid,
    });

    this.options.state.auction = undefined;
    this.options.state.pendingAction = { type: 'end_turn' };
    this.touch();
  }

  endTurn(playerId: string): void {
    const turn = this.requireTurn();
    if (turn.currentPlayerId !== playerId) {
      return;
    }

    if (this.options.state.pendingAction?.type !== 'end_turn') {
      return;
    }

    const current = this.requireBankPlayer(playerId);
    const isDouble = this.options.state.lastDice
      ? this.options.state.lastDice[0] === this.options.state.lastDice[1]
      : false;

    if (!current.inJail && isDouble && current.doublesInRow > 0) {
      turn.hasRolled = false;
      this.options.state.pendingAction = { type: 'roll' };
      this.emit('bank:turn_start', {
        roomCode: this.options.roomCode,
        currentPlayerId: turn.currentPlayerId,
        turnNumber: turn.turnNumber,
        extraTurn: true,
        deadlineAt: turn.turnDeadlineAt,
      });
      this.startTurnClock();
      this.touch();
      return;
    }

    current.doublesInRow = 0;
    const next = this.findNextActivePlayer(turn.currentPlayerId);
    if (!next) {
      this.endGameIfOneLeft();
      return;
    }

    turn.currentPlayerId = next.playerId;
    turn.turnNumber += 1;
    turn.hasRolled = false;
    this.options.state.pendingAction = { type: 'roll' };
    this.options.state.lastDice = undefined;

    this.emit('bank:turn_start', {
      roomCode: this.options.roomCode,
      currentPlayerId: turn.currentPlayerId,
      turnNumber: turn.turnNumber,
      deadlineAt: turn.turnDeadlineAt,
    });
    this.startTurnClock();
    this.touch();
  }

  toggleMortgage(playerId: string, tileId: number, mortgaged: boolean): void {
    const bankPlayer = this.requireBankPlayer(playerId);
    const asset = bankPlayer.assets.find((entry) => entry.tileId === tileId);
    if (!asset) {
      return;
    }

    const tile = this.getTile(tileId);
    if (
      !tile ||
      (tile.kind !== 'property' && tile.kind !== 'railroad' && tile.kind !== 'utility')
    ) {
      return;
    }

    if (asset.mortgaged === mortgaged) {
      return;
    }

    if (mortgaged) {
      if (asset.houses > 0 || asset.hotel) {
        return;
      }
      asset.mortgaged = true;
      bankPlayer.cash += tile.mortgageValue;
    } else {
      const redeemCost = Math.ceil(tile.mortgageValue * 1.1);
      if (bankPlayer.cash < redeemCost) {
        return;
      }
      bankPlayer.cash -= redeemCost;
      asset.mortgaged = false;
    }

    this.emit('bank:mortgage_toggled', {
      roomCode: this.options.roomCode,
      playerId,
      tileId,
      mortgaged,
      cash: bankPlayer.cash,
    });
    this.touch();
  }

  houseAction(playerId: string, tileId: number, operation: 'buy' | 'sell'): void {
    const bankPlayer = this.requireBankPlayer(playerId);
    const asset = bankPlayer.assets.find((entry) => entry.tileId === tileId);
    if (!asset) {
      return;
    }

    const tile = this.getTile(tileId);
    if (!tile || tile.kind !== 'property') {
      return;
    }

    if (!this.hasColorMonopoly(playerId, tile.color)) {
      return;
    }

    const groupAssets = bankPlayer.assets
      .map((entry) => ({ entry, tile: this.getTile(entry.tileId) }))
      .filter((item): item is { entry: BankAsset; tile: BankPropertyTile } =>
        Boolean(item.tile && item.tile.kind === 'property' && item.tile.color === tile.color),
      );

    if (operation === 'buy') {
      if (asset.hotel || asset.mortgaged) {
        return;
      }
      const minHouses = Math.min(...groupAssets.map((item) => item.entry.houses));
      if (asset.houses > minHouses) {
        return;
      }
      if (asset.houses < 4) {
        if (bankPlayer.cash < tile.housePrice) {
          return;
        }
        bankPlayer.cash -= tile.housePrice;
        asset.houses += 1;
      } else {
        if (bankPlayer.cash < tile.housePrice) {
          return;
        }
        bankPlayer.cash -= tile.housePrice;
        asset.houses = 0;
        asset.hotel = true;
      }
    } else {
      if (asset.hotel) {
        asset.hotel = false;
        asset.houses = 4;
        bankPlayer.cash += Math.floor(tile.housePrice / 2);
      } else if (asset.houses > 0) {
        const maxHouses = Math.max(...groupAssets.map((item) => item.entry.houses));
        if (asset.houses < maxHouses) {
          return;
        }
        asset.houses -= 1;
        bankPlayer.cash += Math.floor(tile.housePrice / 2);
      } else {
        return;
      }
    }

    this.emit('bank:house_action', {
      roomCode: this.options.roomCode,
      playerId,
      tileId,
      operation,
      houses: asset.houses,
      hotel: asset.hotel,
      cash: bankPlayer.cash,
    });
    this.touch();
  }

  proposeTrade(fromPlayerId: string, payload: TradePayload): void {
    const fromPlayer = this.requireBankPlayer(fromPlayerId);
    const toPlayer = this.requireBankPlayer(payload.toPlayerId);
    if (fromPlayer.bankrupt || toPlayer.bankrupt) {
      return;
    }

    const trade: BankTradeOffer = {
      id: createId('trade'),
      fromPlayerId,
      toPlayerId: payload.toPlayerId,
      cashFrom: payload.cashFrom,
      cashTo: payload.cashTo,
      assetsFrom: payload.assetsFrom,
      assetsTo: payload.assetsTo,
      status: 'pending',
      createdAt: now(),
    };

    this.options.state.openTradeOffers.push(trade);
    this.emit('bank:trade_proposed', {
      roomCode: this.options.roomCode,
      trade,
    });
    this.touch();
  }

  decideTrade(actorId: string, tradeId: string, accept: boolean): void {
    const trade = this.options.state.openTradeOffers.find((item) => item.id === tradeId);
    if (!trade || trade.status !== 'pending') {
      return;
    }

    if (trade.toPlayerId !== actorId) {
      return;
    }

    if (!accept) {
      trade.status = 'rejected';
      this.emit('bank:trade_rejected', {
        roomCode: this.options.roomCode,
        tradeId,
      });
      this.touch();
      return;
    }

    const fromPlayer = this.requireBankPlayer(trade.fromPlayerId);
    const toPlayer = this.requireBankPlayer(trade.toPlayerId);

    if ((trade.cashFrom ?? 0) > fromPlayer.cash || (trade.cashTo ?? 0) > toPlayer.cash) {
      trade.status = 'rejected';
      this.emit('bank:trade_rejected', {
        roomCode: this.options.roomCode,
        tradeId,
      });
      this.touch();
      return;
    }

    if (!this.transferAssets(trade.fromPlayerId, trade.toPlayerId, trade.assetsFrom)) {
      trade.status = 'rejected';
      this.emit('bank:trade_rejected', {
        roomCode: this.options.roomCode,
        tradeId,
      });
      this.touch();
      return;
    }

    if (!this.transferAssets(trade.toPlayerId, trade.fromPlayerId, trade.assetsTo)) {
      trade.status = 'rejected';
      this.emit('bank:trade_rejected', {
        roomCode: this.options.roomCode,
        tradeId,
      });
      this.touch();
      return;
    }

    fromPlayer.cash -= trade.cashFrom ?? 0;
    toPlayer.cash += trade.cashFrom ?? 0;
    toPlayer.cash -= trade.cashTo ?? 0;
    fromPlayer.cash += trade.cashTo ?? 0;

    trade.status = 'accepted';
    this.emit('bank:trade_accepted', {
      roomCode: this.options.roomCode,
      trade,
    });
    this.touch();
  }

  hostAction(actorId: string, action: HostAction | 'toggle_timer', payload?: HostActionPayload): void {
    this.assertHost(actorId);

    if (action === 'pause') {
      this.options.state.paused = true;
    } else if (action === 'resume') {
      this.options.state.paused = false;
    } else if (action === 'skip') {
      const turn = this.requireTurn();
      if (payload?.playerId && payload.playerId !== turn.currentPlayerId) {
        const target = this.options.state.bankPlayers.find(
          (player) => player.playerId === payload.playerId && !player.bankrupt,
        );
        if (!target) {
          return;
        }
        turn.currentPlayerId = target.playerId;
        turn.hasRolled = true;
      }
      this.options.state.pendingAction = { type: 'end_turn' };
      this.endTurn(turn.currentPlayerId);
    } else if (action === 'kick' && payload?.playerId) {
      this.options.removePlayer(payload.playerId);
    } else if (action === 'score_adjust' && payload?.playerId && typeof payload.cashDelta === 'number') {
      const target = this.requireBankPlayer(payload.playerId);
      target.cash += payload.cashDelta;
    } else if (action === 'toggle_timer' && typeof payload?.timerEnabled === 'boolean') {
      const turn = this.requireTurn();
      turn.timerEnabled = payload.timerEnabled;
      this.startTurnClock();
    }

    this.emit('bank:host_action', {
      roomCode: this.options.roomCode,
      actorId,
      action,
      payload,
    });
    this.touch();
  }

  onPlayerDisconnected(playerId: string): void {
    const turn = this.options.state.turn;
    if (!turn || turn.currentPlayerId !== playerId) {
      return;
    }
    if (turn.timerEnabled) {
      return;
    }
    this.options.state.pendingAction = { type: 'end_turn' };
    this.endTurn(playerId);
  }

  onPlayerRemoved(playerId: string): void {
    const turn = this.options.state.turn;
    if (!turn) {
      return;
    }

    this.options.state.openTradeOffers = this.options.state.openTradeOffers.filter(
      (trade) => trade.fromPlayerId !== playerId && trade.toPlayerId !== playerId,
    );

    if (turn.currentPlayerId === playerId) {
      this.options.state.pendingAction = { type: 'end_turn' };
      const next = this.findNextActivePlayer(playerId);
      if (next) {
        turn.currentPlayerId = next.playerId;
        turn.hasRolled = false;
        turn.turnNumber += 1;
        this.options.state.pendingAction = { type: 'roll' };
      } else {
        this.endGameIfOneLeft();
      }
    }

    this.touch();
  }

  onHostTransferred(): void {
    this.touch();
  }

  private handleLand(playerId: string): void {
    const player = this.requireBankPlayer(playerId);
    const tile = this.getTile(player.position);
    if (!tile) {
      this.options.state.pendingAction = { type: 'end_turn' };
      return;
    }

    this.emit('bank:land', {
      roomCode: this.options.roomCode,
      playerId,
      tile,
    });

    if (tile.kind === 'go') {
      this.options.state.pendingAction = { type: 'end_turn' };
      return;
    }

    if (tile.kind === 'go_to_jail') {
      this.sendToJail(playerId, 'GO_TO_JAIL_TILE');
      this.options.state.pendingAction = { type: 'end_turn' };
      return;
    }

    if (tile.kind === 'tax') {
      this.pay(playerId, undefined, tile.amount, 'TAX');
      this.options.state.pendingAction = { type: 'end_turn' };
      return;
    }

    if (tile.kind === 'chance') {
      this.options.state.pendingAction = undefined;
      this.resolveCard(playerId, 'chance');
      if (!this.options.state.pendingAction) {
        this.options.state.pendingAction = { type: 'end_turn' };
      }
      return;
    }

    if (tile.kind === 'chest') {
      this.options.state.pendingAction = undefined;
      this.resolveCard(playerId, 'chest');
      if (!this.options.state.pendingAction) {
        this.options.state.pendingAction = { type: 'end_turn' };
      }
      return;
    }

    if (tile.kind === 'free_parking') {
      if (this.useFreeParkingJackpot() && this.options.state.freeParkingPot > 0) {
        player.cash += this.options.state.freeParkingPot;
        this.options.state.freeParkingPot = 0;
      }
      this.options.state.pendingAction = { type: 'end_turn' };
      return;
    }

    if (tile.kind === 'jail') {
      this.options.state.pendingAction = { type: 'end_turn' };
      return;
    }

    if (tile.kind === 'property' || tile.kind === 'railroad' || tile.kind === 'utility') {
      const owner = this.ownerOf(tile.id);
      if (!owner) {
        this.options.state.pendingAction = { type: 'buy_or_auction', tileId: tile.id };
        this.emit('bank:buy_offer', {
          roomCode: this.options.roomCode,
          playerId,
          tile,
        });
        return;
      }

      if (owner.playerId === playerId || owner.asset.mortgaged) {
        this.options.state.pendingAction = { type: 'end_turn' };
        return;
      }

      const rent = this.calculateRent(tile, owner.playerId);
      this.pay(playerId, owner.playerId, rent, 'RENT');
      this.emit('bank:rent_paid', {
        roomCode: this.options.roomCode,
        fromPlayerId: playerId,
        toPlayerId: owner.playerId,
        amount: rent,
        tileId: tile.id,
      });
      this.options.state.pendingAction = { type: 'end_turn' };
      return;
    }
  }

  private resolveCard(playerId: string, type: 'chance' | 'chest'): void {
    const card = type === 'chance' ? pickOne(CHANCE_ACTIONS) : pickOne(CHEST_ACTIONS);
    this.emit(`bank:${type}_card`, {
      roomCode: this.options.roomCode,
      playerId,
      card,
    });

    if (card.type === 'gain') {
      this.requireBankPlayer(playerId).cash += card.amount;
      return;
    }

    if (card.type === 'pay') {
      this.pay(playerId, undefined, card.amount, 'CARD_PAYMENT');
      return;
    }

    if (card.type === 'move') {
      const player = this.requireBankPlayer(playerId);
      const passedGo = card.position < player.position;
      player.position = card.position;
      if (passedGo) {
        player.cash += this.options.state.board.goSalary;
      }
      this.handleLand(playerId);
      return;
    }

    if (card.type === 'jail') {
      this.sendToJail(playerId, 'CARD_JAIL');
      this.options.state.pendingAction = { type: 'end_turn' };
    }
  }

  private pay(
    fromPlayerId: string,
    toPlayerId: string | undefined,
    amount: number,
    reason: string,
  ): void {
    const from = this.requireBankPlayer(fromPlayerId);
    if (from.cash >= amount) {
      from.cash -= amount;
      if (toPlayerId) {
        this.requireBankPlayer(toPlayerId).cash += amount;
      } else if (this.useFreeParkingJackpot() && ['TAX', 'CARD_PAYMENT'].includes(reason)) {
        this.options.state.freeParkingPot += amount;
      }
      return;
    }

    const paid = from.cash;
    from.cash = 0;
    from.bankrupt = true;

    if (toPlayerId) {
      const target = this.requireBankPlayer(toPlayerId);
      target.cash += paid;
      this.transferAssets(fromPlayerId, toPlayerId, from.assets.map((asset) => asset.tileId), true);
    } else {
      from.assets = [];
    }

    this.emit('bank:bankruptcy', {
      roomCode: this.options.roomCode,
      playerId: fromPlayerId,
      toPlayerId,
      reason,
    });

    this.endGameIfOneLeft();
  }

  private movePlayer(playerId: string, steps: number): void {
    const player = this.requireBankPlayer(playerId);
    const nextPosition = (player.position + steps) % this.options.state.board.tiles.length;
    if (player.position + steps >= this.options.state.board.tiles.length) {
      player.cash += this.options.state.board.goSalary;
    }
    player.position = nextPosition;
    this.handleLand(playerId);
  }

  private startAuction(tileId: number): void {
    const eligible = this.activePlayersInOrder().map((player) => player.playerId);
    this.options.state.auction = {
      tileId,
      startedAt: now(),
      activeBid: 0,
      eligibleBidderIds: eligible,
      closed: false,
    };
    this.options.state.pendingAction = { type: 'auction', tileId };
    this.emit('bank:auction_start', {
      roomCode: this.options.roomCode,
      tileId,
      eligibleBidderIds: eligible,
    });
    this.touch();
  }

  private transferAssets(
    fromPlayerId: string,
    toPlayerId: string,
    tileIds: number[],
    force = false,
  ): boolean {
    const from = this.requireBankPlayer(fromPlayerId);
    const to = this.requireBankPlayer(toPlayerId);

    for (const tileId of tileIds) {
      const idx = from.assets.findIndex((asset) => asset.tileId === tileId);
      if (idx === -1) {
        if (force) {
          continue;
        }
        return false;
      }
      const [asset] = from.assets.splice(idx, 1);
      to.assets.push(asset);
    }

    return true;
  }

  private addAsset(playerId: string, tileId: number): void {
    const player = this.requireBankPlayer(playerId);
    if (player.assets.some((asset) => asset.tileId === tileId)) {
      return;
    }

    player.assets.push({
      tileId,
      houses: 0,
      hotel: false,
      mortgaged: false,
    });
  }

  private ownerOf(tileId: number): { playerId: string; asset: BankAsset } | undefined {
    for (const bankPlayer of this.options.state.bankPlayers) {
      const asset = bankPlayer.assets.find((entry) => entry.tileId === tileId);
      if (asset) {
        return { playerId: bankPlayer.playerId, asset };
      }
    }
    return undefined;
  }

  private calculateRent(tile: BankTile, ownerPlayerId: string): number {
    const ownerState = this.requireBankPlayer(ownerPlayerId);
    const ownerAsset = ownerState.assets.find((asset) => asset.tileId === tile.id);
    if (!ownerAsset || ownerAsset.mortgaged) {
      return 0;
    }

    if (tile.kind === 'railroad') {
      const count = ownerState.assets.filter((asset) => {
        const assetTile = this.getTile(asset.tileId);
        return assetTile?.kind === 'railroad' && !asset.mortgaged;
      }).length;
      return tile.rentByCount[Math.max(0, Math.min(3, count - 1))];
    }

    if (tile.kind === 'utility') {
      const count = ownerState.assets.filter((asset) => {
        const assetTile = this.getTile(asset.tileId);
        return assetTile?.kind === 'utility' && !asset.mortgaged;
      }).length;
      const multiplier = count >= 2 ? tile.rentMultiplierTwo : tile.rentMultiplierOne;
      const diceTotal = this.options.state.lastDice
        ? this.options.state.lastDice[0] + this.options.state.lastDice[1]
        : 7;
      return multiplier * diceTotal;
    }

    if (tile.kind === 'property') {
      if (ownerAsset.hotel) {
        return tile.rentWithHotel;
      }
      if (ownerAsset.houses > 0) {
        return tile.rentWithHouse[ownerAsset.houses - 1] ?? tile.rentWithHotel;
      }
      const monopoly = this.hasColorMonopoly(ownerPlayerId, tile.color);
      return monopoly ? tile.baseRent * 2 : tile.baseRent;
    }

    return 0;
  }

  private hasColorMonopoly(playerId: string, color: string): boolean {
    const allColorTiles = this.options.state.board.tiles.filter(
      (tile): tile is BankPropertyTile => tile.kind === 'property' && tile.color === color,
    );
    if (allColorTiles.length === 0) {
      return false;
    }

    const player = this.requireBankPlayer(playerId);
    return allColorTiles.every((tile) => player.assets.some((asset) => asset.tileId === tile.id));
  }

  private sendToJail(playerId: string, reason: string): void {
    const player = this.requireBankPlayer(playerId);
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesInRow = 0;
    this.emit('bank:jail_update', {
      roomCode: this.options.roomCode,
      playerId,
      reason,
    });
  }

  private activePlayersInOrder(): BankPlayerState[] {
    return this.options.state.bankPlayers.filter((player) => !player.bankrupt);
  }

  private findNextActivePlayer(currentPlayerId: string): BankPlayerState | undefined {
    const active = this.activePlayersInOrder();
    if (active.length <= 1) {
      return undefined;
    }

    const currentIdx = active.findIndex((player) => player.playerId === currentPlayerId);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % active.length;
    return active[nextIdx];
  }

  private startTurnClock(): void {
    this.clearTurnTimer();
    const turn = this.options.state.turn;
    if (!turn) {
      return;
    }

    if (!turn.timerEnabled) {
      turn.turnDeadlineAt = undefined;
      return;
    }

    turn.turnDeadlineAt = now() + TURN_SECONDS_DEFAULT * 1000;
    this.turnTimer = setTimeout(() => {
      const activeTurn = this.options.state.turn;
      if (!activeTurn || !activeTurn.timerEnabled) {
        return;
      }
      this.emit('bank:turn_timeout', {
        roomCode: this.options.roomCode,
        playerId: activeTurn.currentPlayerId,
      });
      this.options.state.pendingAction = { type: 'end_turn' };
      this.endTurn(activeTurn.currentPlayerId);
    }, TURN_SECONDS_DEFAULT * 1000);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = undefined;
    }
  }

  private requireTurn() {
    if (!this.options.state.turn) {
      throw new Error('INVALID_ACTION');
    }
    return this.options.state.turn;
  }

  private getTile(tileId: number): BankTile | undefined {
    return this.options.state.board.tiles.find((tile) => tile.id === tileId);
  }

  private requireBankPlayer(playerId: string): BankPlayerState {
    const player = this.options.state.bankPlayers.find((entry) => entry.playerId === playerId);
    if (!player) {
      throw new Error('INVALID_ACTION');
    }
    return player;
  }

  private endGameIfOneLeft(): void {
    const active = this.activePlayersInOrder();
    if (active.length !== 1) {
      return;
    }

    const winner = active[0];
    this.options.state.meta.status = 'finished';
    this.options.state.winnerId = winner.playerId;
    this.options.state.endedAt = now();
    this.emit('bank:game_end', {
      roomCode: this.options.roomCode,
      winnerPlayerId: winner.playerId,
    });
  }

  private useHouseRules(): boolean {
    return this.options.state.rulePreset === 'house';
  }

  private useFreeParkingJackpot(): boolean {
    return this.useHouseRules() && this.options.state.board.houseRules.freeParkingJackpot;
  }

  private roll(): RollResult {
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    return {
      d1,
      d2,
      total: d1 + d2,
      isDouble: d1 === d2,
    };
  }

  private assertHost(playerId: string): void {
    if (this.options.state.meta.hostId !== playerId) {
      throw new Error('FORBIDDEN');
    }
  }

  private emit(event: string, payload: unknown): void {
    this.options.emit(event, payload);
  }

  private touch(): void {
    this.options.state.meta.updatedAt = now();
    this.options.onStateChange();
  }
}
