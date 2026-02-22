import type { BankTile, Language } from '@ags/shared';
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';
import { colorForTile } from './boardMath';
import chanceIconUrl from './assets/chance-icon.svg';
import chestIconUrl from './assets/chest-icon.svg';

const TILE_SIZE = 1024;
const STRIP_HEIGHT = 148;
const textureCache = new Map<string, CanvasTexture>();

const iconImages: Partial<Record<'chance' | 'chest', HTMLImageElement>> = {};

export function getTileTexture(tile: BankTile, language: Language): CanvasTexture {
  const key = `${tile.id}:${language}`;
  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    const fallback = new CanvasTexture(canvas);
    textureCache.set(key, fallback);
    return fallback;
  }

  drawTileCard(context, tile, language);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  textureCache.set(key, texture);
  return texture;
}

function drawTileCard(context: CanvasRenderingContext2D, tile: BankTile, language: Language): void {
  context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  context.fillStyle = '#eff4ff';
  context.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  context.fillStyle = '#e7eefc';
  context.fillRect(26, 26, TILE_SIZE - 52, TILE_SIZE - 52);

  context.strokeStyle = '#2f4f86';
  context.lineWidth = 14;
  context.strokeRect(20, 20, TILE_SIZE - 40, TILE_SIZE - 40);

  context.fillStyle = colorForTile(tile);
  context.fillRect(20, 20, TILE_SIZE - 40, STRIP_HEIGHT);

  context.strokeStyle = 'rgba(255, 255, 255, 0.26)';
  context.lineWidth = 3;
  context.strokeRect(20, 20, TILE_SIZE - 40, STRIP_HEIGHT);

  const kindText = kindLabel(tile.kind, language);
  context.fillStyle = '#0e264f';
  context.font = language === 'ar'
    ? "700 48px 'Tajawal', 'IBM Plex Sans Arabic', sans-serif"
    : "700 42px 'Orbitron', 'IBM Plex Sans Arabic', sans-serif";
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(255, 255, 255, 0.42)';
  context.shadowBlur = 8;
  context.fillText(kindText, TILE_SIZE / 2, 84);
  context.shadowBlur = 0;

  const localizedName = language === 'ar' ? tile.name.ar : tile.name.en;
  context.fillStyle = '#081b38';
  context.font = language === 'ar'
    ? "700 94px 'Tajawal', 'IBM Plex Sans Arabic', sans-serif"
    : "700 82px 'Orbitron', 'IBM Plex Sans Arabic', sans-serif";
  context.shadowColor = 'rgba(255, 255, 255, 0.56)';
  context.shadowBlur = 10;
  wrapTextCentered(context, localizedName, TILE_SIZE / 2, 332, TILE_SIZE - 136, 100, 2);
  context.shadowBlur = 0;

  const iconType = tile.kind === 'chance' || tile.kind === 'chest' ? tile.kind : undefined;
  if (iconType) {
    drawOptionalIcon(context, iconType);
  }

  const value = tileValue(tile);
  if (value) {
    context.fillStyle = '#0b336b';
    context.font = "700 108px 'Orbitron', 'IBM Plex Sans Arabic', sans-serif";
    context.shadowColor = 'rgba(255, 255, 255, 0.62)';
    context.shadowBlur = 12;
    context.fillText(value, TILE_SIZE / 2, TILE_SIZE - 122);
    context.shadowBlur = 0;
  } else {
    context.fillStyle = '#264775';
    context.font = language === 'ar'
      ? "700 62px 'Tajawal', 'IBM Plex Sans Arabic', sans-serif"
      : "700 52px 'Orbitron', 'IBM Plex Sans Arabic', sans-serif";
    context.fillText(kindFooter(tile.kind, language), TILE_SIZE / 2, TILE_SIZE - 122);
  }
}

function drawOptionalIcon(context: CanvasRenderingContext2D, kind: 'chance' | 'chest'): void {
  const icon = getIcon(kind);
  if (icon?.complete) {
    context.globalAlpha = 0.92;
    context.drawImage(icon, TILE_SIZE / 2 - 122, TILE_SIZE / 2 - 46, 244, 244);
    context.globalAlpha = 1;
    return;
  }

  context.strokeStyle = '#9cc8ff';
  context.lineWidth = 14;
  context.strokeRect(TILE_SIZE / 2 - 104, TILE_SIZE / 2 - 36, 208, 208);
}

function getIcon(kind: 'chance' | 'chest'): HTMLImageElement | undefined {
  const cached = iconImages[kind];
  if (cached) {
    return cached;
  }

  const image = new Image();
  image.src = kind === 'chance' ? chanceIconUrl : chestIconUrl;
  iconImages[kind] = image;
  return image;
}

function kindLabel(kind: BankTile['kind'], language: Language): string {
  if (language === 'ar') {
    switch (kind) {
      case 'property':
        return 'عقار';
      case 'railroad':
        return 'سكة';
      case 'utility':
        return 'خدمة';
      case 'tax':
        return 'ضريبة';
      case 'chance':
        return 'فرصة';
      case 'chest':
        return 'صندوق';
      case 'go':
        return 'انطلق';
      case 'jail':
        return 'سجن';
      case 'go_to_jail':
        return 'روح السجن';
      default:
        return 'ميدان';
    }
  }

  switch (kind) {
    case 'property':
      return 'PROPERTY';
    case 'railroad':
      return 'RAILROAD';
    case 'utility':
      return 'UTILITY';
    case 'tax':
      return 'TAX';
    case 'chance':
      return 'CHANCE';
    case 'chest':
      return 'CHEST';
    case 'go':
      return 'GO';
    case 'jail':
      return 'JAIL';
    case 'go_to_jail':
      return 'GO TO JAIL';
    default:
      return 'TILE';
  }
}

function kindFooter(kind: BankTile['kind'], language: Language): string {
  if (language === 'ar') {
    if (kind === 'free_parking') {
      return 'ركنة';
    }
    return 'مربع';
  }
  if (kind === 'free_parking') {
    return 'FREE PARKING';
  }
  return 'SPECIAL TILE';
}

function tileValue(tile: BankTile): string | undefined {
  if (tile.kind === 'property' || tile.kind === 'railroad' || tile.kind === 'utility') {
    return `$${tile.price}`;
  }
  if (tile.kind === 'tax') {
    return `-$${tile.amount}`;
  }
  return undefined;
}

function wrapTextCentered(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = words[0] ?? '';

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }
  lines.push(current);

  lines.slice(0, maxLines).forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}
