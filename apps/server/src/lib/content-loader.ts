import fs from 'node:fs';
import path from 'node:path';
import {
  type BankBoardConfig,
  type FlagQuestion,
  type ReversedQuestion,
  type TriviaQuestion,
} from '@ags/shared';

interface CasinoContent {
  reversed: ReversedQuestion[];
  flags: FlagQuestion[];
  trivia: TriviaQuestion[];
  drawing: string[];
}

function resolveContentDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'content'),
    path.resolve(process.cwd(), '../../content'),
    path.resolve(process.cwd(), '../content'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to locate content directory.');
}

function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export function loadCasinoContent(): CasinoContent {
  const contentDir = resolveContentDir();
  const casinoDir = path.join(contentDir, 'casino');
  return {
    reversed: readJson<ReversedQuestion[]>(path.join(casinoDir, 'reversed.json')),
    flags: readJson<FlagQuestion[]>(path.join(casinoDir, 'flags.json')),
    trivia: readJson<TriviaQuestion[]>(path.join(casinoDir, 'trivia.json')),
    drawing: readJson<string[]>(path.join(casinoDir, 'drawing.json')),
  };
}

export function loadEgyptBoard(): BankBoardConfig {
  const contentDir = resolveContentDir();
  return readJson<BankBoardConfig>(path.join(contentDir, 'bank', 'egypt-board.json'));
}