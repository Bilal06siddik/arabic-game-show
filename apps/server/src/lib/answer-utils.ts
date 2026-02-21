export function normalizeArabic(input: string): string {
  if (!input) {
    return '';
  }
  return input
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next =
        a[i - 1] === b[j - 1]
          ? matrix[j - 1]
          : 1 + Math.min(prev, matrix[j], matrix[j - 1]);
      matrix[j - 1] = prev;
      prev = next;
    }
    matrix[b.length] = prev;
  }
  return matrix[b.length];
}

export function matchesAnswer(
  input: string,
  answer: string,
  alternatives: string[] = [],
): boolean {
  if (!input.trim()) {
    return false;
  }

  const normalizedInput = normalizeArabic(input);
  const normalizedAnswer = normalizeArabic(answer);
  if (normalizedInput === normalizedAnswer) {
    return true;
  }

  if (
    normalizedAnswer.includes(normalizedInput) ||
    normalizedInput.includes(normalizedAnswer)
  ) {
    return true;
  }

  for (const alternative of alternatives) {
    const normalizedAlt = normalizeArabic(alternative);
    if (
      normalizedInput === normalizedAlt ||
      normalizedAlt.includes(normalizedInput) ||
      normalizedInput.includes(normalizedAlt)
    ) {
      return true;
    }
  }

  if (normalizedAnswer.length > 3) {
    const threshold = Math.max(1, Math.floor(normalizedAnswer.length * 0.25));
    if (levenshtein(normalizedInput, normalizedAnswer) <= threshold) {
      return true;
    }
  }

  return false;
}