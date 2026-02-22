export type Language = 'ar' | 'en';
export type Role = 'host' | 'player';
export type GameType = 'casino' | 'bank';
export type RoomStatus = 'lobby' | 'in_game' | 'finished';
export type HostAction = 'pause' | 'resume' | 'skip' | 'kick' | 'score_adjust';

export interface Player {
  id: string;
  name: string;
  role: Role;
  seatIndex: number;
  isHost: boolean;
  connected: boolean;
  language: Language;
  score?: number;
  joinedAt: number;
  lastSeenAt: number;
}

export interface Session {
  token: string;
  playerId: string;
  roomCode: string;
  expiresAt: number;
}

export interface RoomMeta {
  code: string;
  gameType: GameType;
  hostId: string;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
}

export interface RoomStateBase {
  meta: RoomMeta;
  players: Player[];
  paused: boolean;
  startedAt?: number;
  endedAt?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface RoomMetaView {
  code: string;
  gameType: GameType;
  status: RoomStatus;
  playersCount: number;
  hostName?: string;
}

export type CasinoRoundType = 'reversed' | 'flag' | 'trivia' | 'drawing';

export interface CasinoQuestionBase {
  id: string;
  answer: string;
  alt?: string[];
}

export interface ReversedQuestion extends CasinoQuestionBase {
  type: 'reversed';
  reversed: string;
}

export interface FlagQuestion extends CasinoQuestionBase {
  type: 'flag';
  countryCode: string;
  countryName: string;
}

export interface TriviaQuestion extends CasinoQuestionBase {
  type: 'trivia';
  question: string;
}

export interface DrawingPrompt {
  type: 'drawing';
  id: string;
  word: string;
}

export type CasinoQuestionItem =
  | ReversedQuestion
  | FlagQuestion
  | TriviaQuestion
  | DrawingPrompt;

export interface DrawingSubmission {
  playerId: string;
  imageDataUrl: string;
  submittedAt: number;
}

export interface DrawingVote {
  voterId: string;
  targetPlayerId: string;
  votedAt: number;
}

export interface CasinoDrawingRoundState {
  currentDrawerIndex: number;
  drawerOrder: string[];
  submissions: DrawingSubmission[];
  votingPlayerOrder: string[];
  currentVoterIndex: number;
  votes: DrawingVote[];
  phase: 'ready_up' | 'drawing' | 'voting' | 'done';
  drawingDeadlineAt?: number;
  readyPlayerIds: string[];
}

export interface CasinoRoundState {
  roundNumber: number;
  type: CasinoRoundType;
  startedAt: number;
  question: CasinoQuestionItem;
  answerRevealed: boolean;
  revealedAnswer?: string;
  buzzerWindowId?: string;
  buzzedPlayerId?: string;
  excludedPlayerIds: string[];
  answerDeadlineAt?: number;
  drawing?: CasinoDrawingRoundState;
  /** How many players have voted to repeat the reversed-words sequence */
  repeatVoteCount?: number;
  /** Player IDs that have voted to repeat (prevents double votes) */
  repeatVoterIds?: string[];
  /** How many players have voted to give up and reveal the answer */
  giveUpCount?: number;
  /** Player IDs that have voted to give up */
  giveUpVoterIds?: string[];
}

export interface CasinoRoomState extends RoomStateBase {
  gameType: 'casino';
  targetScore: number;
  hostMode: 'player' | 'moderator' | 'ai';
  currentRound?: CasinoRoundState;
  roundQueue: CasinoRoundType[];
  usedQuestionIds: Record<'reversed' | 'flag' | 'trivia' | 'drawing', string[]>;
  winnerId?: string;
  statusMessage?: string;
}

export type BankRulePreset = 'official' | 'house';
export type BankTileKind =
  | 'go'
  | 'property'
  | 'railroad'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'chest'
  | 'jail'
  | 'go_to_jail'
  | 'free_parking';

export interface TileName {
  ar: string;
  en: string;
}

export interface BankTileBase {
  id: number;
  kind: BankTileKind;
  name: TileName;
}

export interface BankPropertyTile extends BankTileBase {
  kind: 'property';
  color: string;
  price: number;
  baseRent: number;
  rentWithHouse: [number, number, number, number];
  rentWithHotel: number;
  mortgageValue: number;
  housePrice: number;
}

export interface BankRailroadTile extends BankTileBase {
  kind: 'railroad';
  price: number;
  mortgageValue: number;
  rentByCount: [number, number, number, number];
}

export interface BankUtilityTile extends BankTileBase {
  kind: 'utility';
  price: number;
  mortgageValue: number;
  rentMultiplierOne: number;
  rentMultiplierTwo: number;
}

export interface BankTaxTile extends BankTileBase {
  kind: 'tax';
  amount: number;
}

export interface BankSimpleTile extends BankTileBase {
  kind: 'go' | 'chance' | 'chest' | 'jail' | 'go_to_jail' | 'free_parking';
}

export type BankTile =
  | BankPropertyTile
  | BankRailroadTile
  | BankUtilityTile
  | BankTaxTile
  | BankSimpleTile;

export interface BankBoardConfig {
  id: string;
  name: TileName;
  goSalary: number;
  jailFine: number;
  houseRules: {
    freeParkingJackpot: boolean;
  };
  tiles: BankTile[];
}

export interface BankAsset {
  tileId: number;
  houses: number;
  hotel: boolean;
  mortgaged: boolean;
}

export interface BankPlayerState {
  playerId: string;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  doublesInRow: number;
  bankrupt: boolean;
  assets: BankAsset[];
}

export interface BankAuctionState {
  tileId: number;
  startedAt: number;
  activeBid: number;
  activeBidderId?: string;
  eligibleBidderIds: string[];
  closed: boolean;
}

export interface BankTradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  cashFrom?: number;
  cashTo?: number;
  assetsFrom: number[];
  assetsTo: number[];
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: number;
}

export interface BankTurnState {
  currentPlayerId: string;
  turnNumber: number;
  timerEnabled: boolean;
  turnDeadlineAt?: number;
  hasRolled: boolean;
}

export interface BankPendingAction {
  type:
  | 'roll'
  | 'buy_or_auction'
  | 'auction'
  | 'resolve_rent'
  | 'jail_choice'
  | 'end_turn';
  tileId?: number;
}

export interface BankRoomState extends RoomStateBase {
  gameType: 'bank';
  rulePreset: BankRulePreset;
  board: BankBoardConfig;
  bankPlayers: BankPlayerState[];
  turn?: BankTurnState;
  pendingAction?: BankPendingAction;
  auction?: BankAuctionState;
  openTradeOffers: BankTradeOffer[];
  winnerId?: string;
  freeParkingPot: number;
  lastDice?: [number, number];
  lastEvent?: string;
}

export interface CreateRoomResult {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface JoinRoomResult {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface ReconnectResult {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface SocketAuthPayload {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  gameType: GameType;
}

export interface SocketStateSync<TState> {
  roomCode: string;
  state: TState;
  serverTime: number;
}
