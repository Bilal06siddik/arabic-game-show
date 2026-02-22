export const NAMESPACES = {
  casino: '/casino',
  bank: '/bank',
} as const;

export const ROOM_LIMITS = {
  casino: 8,
  bank: 6,
} as const;

export const ANSWER_SECONDS = 7;
export const DRAWING_SECONDS = 30;
export const TURN_SECONDS_DEFAULT = 45;

export const ERROR_CODES = {
  roomNotFound: 'ROOM_NOT_FOUND',
  roomFull: 'ROOM_FULL',
  invalidSession: 'INVALID_SESSION',
  forbidden: 'FORBIDDEN',
  invalidPayload: 'INVALID_PAYLOAD',
  invalidAction: 'INVALID_ACTION',
  alreadyStarted: 'ALREADY_STARTED',
  notStarted: 'NOT_STARTED',
} as const;

export const PIECE_COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'teal',
  'pink',
] as const;
