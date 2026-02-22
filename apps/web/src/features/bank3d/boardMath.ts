import type { BankTile } from '@ags/shared';

export const BOARD_TILE_COUNT = 40;
export const TILES_PER_SIDE = 10;
export const TILE_SPACING = 2.52;
export const BOARD_HALF_EXTENT = TILE_SPACING * 4.5;
export const BOARD_OUTER_SIZE = 30;
export const BOARD_INNER_SIZE = 23.8;
export const BOARD_CENTER_SIZE = 10.8;
export const CORNER_TILE_SIZE = 3.06;
export const EDGE_TILE_LONG = 2.46;
export const EDGE_TILE_SHORT = 2.04;
export const CAMERA_PAN_LIMIT = 9.6;

export type TileSide = 'bottom' | 'left' | 'top' | 'right';

export interface TileWorldPosition {
  x: number;
  z: number;
  side: TileSide;
  isCorner: boolean;
}

export function tileRotationY(side: TileSide): number {
  return side === 'left' || side === 'right' ? Math.PI / 2 : 0;
}

export function tileFootprint(isCorner: boolean): [number, number] {
  if (isCorner) {
    return [CORNER_TILE_SIZE, CORNER_TILE_SIZE];
  }
  return [EDGE_TILE_LONG, EDGE_TILE_SHORT];
}

export function normalizeTileIndex(index: number, total = BOARD_TILE_COUNT): number {
  const wrapped = index % total;
  return wrapped < 0 ? wrapped + total : wrapped;
}

export function tileIndexToWorld(tileIndex: number): TileWorldPosition {
  const index = normalizeTileIndex(tileIndex);

  if (index <= 9) {
    return {
      x: BOARD_HALF_EXTENT - index * TILE_SPACING,
      z: BOARD_HALF_EXTENT,
      side: 'bottom',
      isCorner: index === 0 || index === 9,
    };
  }

  if (index <= 19) {
    return {
      x: -BOARD_HALF_EXTENT,
      z: BOARD_HALF_EXTENT - (index - 10) * TILE_SPACING,
      side: 'left',
      isCorner: index === 10 || index === 19,
    };
  }

  if (index <= 29) {
    return {
      x: -BOARD_HALF_EXTENT + (index - 20) * TILE_SPACING,
      z: -BOARD_HALF_EXTENT,
      side: 'top',
      isCorner: index === 20 || index === 29,
    };
  }

  return {
    x: BOARD_HALF_EXTENT,
    z: -BOARD_HALF_EXTENT + (index - 30) * TILE_SPACING,
    side: 'right',
    isCorner: index === 30 || index === 39,
  };
}

export function colorForTile(tile: BankTile): string {
  if (tile.kind === 'property') {
    return propertyGroupColor(tile.color);
  }
  if (tile.kind === 'railroad') {
    return '#6a7688';
  }
  if (tile.kind === 'utility') {
    return '#4f87b8';
  }
  if (tile.kind === 'chance') {
    return '#f0a129';
  }
  if (tile.kind === 'chest') {
    return '#4ba58f';
  }
  if (tile.kind === 'tax') {
    return '#bf4d4d';
  }
  if (tile.kind === 'go') {
    return '#2f9e44';
  }
  if (tile.kind === 'jail') {
    return '#bf6b2f';
  }
  if (tile.kind === 'go_to_jail') {
    return '#9d3030';
  }
  return '#7a7f88';
}

function propertyGroupColor(color: string): string {
  switch (color) {
    case 'brown':
      return '#8f5d3b';
    case 'light_blue':
      return '#9cd8ff';
    case 'pink':
      return '#e78fe7';
    case 'orange':
      return '#f4a746';
    case 'red':
      return '#d34f4f';
    case 'yellow':
      return '#e1cb45';
    case 'green':
      return '#2e9a5f';
    case 'dark_blue':
      return '#2c4f8d';
    default:
      return '#7a7f88';
  }
}
